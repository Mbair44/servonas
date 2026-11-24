import {NextResponse} from "next/server";
import Stripe from "stripe";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {stripeClient} from "@/lib/stripeConnect";
import {shouldApplySubscriptionEvent} from "@/lib/pricing/subscriptionEventOrdering";

export const runtime="nodejs";
const unixDate=(value:number|null|undefined)=>value?new Date(value*1000).toISOString():null;

export async function POST(request:Request){
 const key=process.env.STRIPE_SECRET_KEY,secret=process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET,db=getSupabaseAdmin();
 if(!key||!secret||!db)return NextResponse.json({error:"Subscription webhook is not configured."},{status:503});
 const signature=request.headers.get("stripe-signature");
 if(!signature)return NextResponse.json({error:"Missing Stripe signature."},{status:400});
 let event:Stripe.Event;
 try{event=new Stripe(key).webhooks.constructEvent(await request.text(),signature,secret);}
 catch(error){console.error("Invalid Servonas subscription webhook signature",{message:error instanceof Error?error.message:"Unknown error"});return NextResponse.json({error:"Invalid signature."},{status:400});}

 const eventCreatedAt=new Date(event.created*1000).toISOString();
 if(event.type==="checkout.session.completed"){
  const session=event.data.object as Stripe.Checkout.Session;
  if(session.metadata?.purpose!=="servonas_subscription"||!session.metadata.business_id)return NextResponse.json({received:true,ignored:true});
  const subscriptionId=typeof session.subscription==="string"?session.subscription:session.subscription?.id;
  if(!subscriptionId)return NextResponse.json({received:true,ignored:true});
  const claimed=await db.rpc("claim_stripe_subscription_event",{p_event_id:event.id,p_event_type:event.type,p_business_id:session.metadata.business_id,p_subscription_id:subscriptionId,p_event_created_at:eventCreatedAt});
  if(claimed.error)return NextResponse.json({error:"Subscription receipt could not be claimed."},{status:500});
  if(claimed.data!==true)return NextResponse.json({received:true,duplicate:true});
  // Checkout never grants an entitlement. The subscription event/retrieval below
  // remains the single Stripe-authoritative synchronization path.
  await db.rpc("complete_stripe_subscription_event",{p_event_id:event.id,p_state:"applied",p_error:null});
  return NextResponse.json({received:true,checkoutRecorded:true});
 }

 if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type)){
  const eventSubscription=event.data.object as Stripe.Subscription;
  const businessId=eventSubscription.metadata.business_id;
  if(!businessId)return NextResponse.json({received:true,ignored:true});
  const eventSubscriptionId=eventSubscription.id,claimed=await db.rpc("claim_stripe_subscription_event",{p_event_id:event.id,p_event_type:event.type,p_business_id:businessId,p_subscription_id:eventSubscriptionId,p_event_created_at:eventCreatedAt});
  if(claimed.error)return NextResponse.json({error:"Subscription receipt could not be claimed."},{status:500});
  if(claimed.data!==true)return NextResponse.json({received:true,duplicate:true});
  try{
  const subscription=await stripeClient().subscriptions.retrieve(eventSubscriptionId);
  if(subscription.metadata.business_id!==businessId||subscription.metadata.platform!=="servonas")throw new Error("Stripe subscription ownership mismatch");
  const {data:current}=await db.from("business_platform_subscriptions").select("stripe_subscription_id,stripe_customer_id,stripe_last_event_created_at").eq("business_id",businessId).maybeSingle();
  if(current?.stripe_subscription_id&&current.stripe_subscription_id!==subscription.id)throw new Error("Tenant subscription mismatch");
  if(current?.stripe_customer_id&&current.stripe_customer_id!==(typeof subscription.customer==="string"?subscription.customer:subscription.customer.id))throw new Error("Stripe customer mismatch");
  if(!shouldApplySubscriptionEvent(current?.stripe_last_event_created_at??null,eventCreatedAt)){await db.rpc("complete_stripe_subscription_event",{p_event_id:event.id,p_state:"ignored",p_error:null});return NextResponse.json({received:true,stale:true});}
  const periodEnd=(subscription as Stripe.Subscription&{current_period_end?:number}).current_period_end;
  const status=subscription.status;
  const stripePriceId=subscription.items.data[0]?.price.id??null;
  const [{data:profile},{data:priceMapping}]=await Promise.all([
   db.from("business_pricing_profiles").select("plan_key,rollout_enabled").eq("business_id",businessId).maybeSingle(),
   stripePriceId?db.from("servonas_subscription_plan_prices").select("plan_key").eq("stripe_price_id",stripePriceId).eq("active",true).maybeSingle():Promise.resolve({data:null}),
  ]);
  const {error}=await db.from("business_platform_subscriptions").upsert({
   business_id:businessId,stripe_customer_id:typeof subscription.customer==="string"?subscription.customer:subscription.customer.id,
   stripe_subscription_id:subscription.id,stripe_price_id:stripePriceId,plan_key:priceMapping?.plan_key??null,status,
   trial_ends_at:unixDate(subscription.trial_end),current_period_ends_at:unixDate(periodEnd),
   cancel_at_period_end:subscription.cancel_at_period_end,stripe_last_event_created_at:eventCreatedAt,updated_at:new Date().toISOString(),
  },{onConflict:"business_id"});
  if(error)throw new Error("Subscription state could not be saved.");

  // Legacy profiles deliberately retain their historical entitlement. A subscription
  // event alone is never a migration authorization.
  if(profile?.plan_key==="legacy"||profile?.rollout_enabled!==true||!priceMapping?.plan_key){await db.rpc("complete_stripe_subscription_event",{p_event_id:event.id,p_state:"applied",p_error:null});return NextResponse.json({received:true,legacy:true});}
  const active=status==="active"||status==="trialing",grace=status==="past_due";
  const endsAt=active?null:new Date().toISOString();
  const graceEndsAt=grace?new Date(Date.now()+7*86_400_000).toISOString():null;
  const {error:entitlementError}=await db.from("business_entitlements").update({
   entitlement_key:active||grace?priceMapping.plan_key:"pilot",status:active?"active":grace?"grace_period":"expired",
   source:"billing_sync",ends_at:endsAt,grace_period_ends_at:graceEndsAt,
   metadata:{stripe_subscription_id:subscription.id,stripe_subscription_status:status},updated_at:new Date().toISOString(),
  }).eq("business_id",businessId).in("status",["active","grace_period","expired"]);
  if(entitlementError)throw new Error("Workspace access could not be synchronized.");
  await db.rpc("complete_stripe_subscription_event",{p_event_id:event.id,p_state:"applied",p_error:null});
  }catch(error){await db.rpc("complete_stripe_subscription_event",{p_event_id:event.id,p_state:"failed",p_error:(error instanceof Error?error.message:"sync failed").slice(0,1000)});return NextResponse.json({error:"Subscription synchronization failed."},{status:500});}
 }
 return NextResponse.json({received:true});
}
