import {NextResponse} from "next/server";
import Stripe from "stripe";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

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

 if(event.type==="checkout.session.completed"){
  const session=event.data.object as Stripe.Checkout.Session;
  if(session.metadata?.purpose!=="servonas_subscription"||!session.metadata.business_id)return NextResponse.json({received:true,ignored:true});
  const subscriptionId=typeof session.subscription==="string"?session.subscription:session.subscription?.id;
  const {error}=await db.from("business_platform_subscriptions").update({stripe_subscription_id:subscriptionId??null,status:"trialing",updated_at:new Date().toISOString()}).eq("business_id",session.metadata.business_id);
  if(error)return NextResponse.json({error:"Subscription could not be saved."},{status:500});
  return NextResponse.json({received:true});
 }

 if(["customer.subscription.created","customer.subscription.updated","customer.subscription.deleted"].includes(event.type)){
  const subscription=event.data.object as Stripe.Subscription;
  const businessId=subscription.metadata.business_id;
  if(!businessId)return NextResponse.json({received:true,ignored:true});
  const periodEnd=(subscription as Stripe.Subscription&{current_period_end?:number}).current_period_end;
  const status=event.type==="customer.subscription.deleted"?"canceled":subscription.status;
  const {error}=await db.from("business_platform_subscriptions").upsert({
   business_id:businessId,stripe_customer_id:typeof subscription.customer==="string"?subscription.customer:subscription.customer.id,
   stripe_subscription_id:subscription.id,stripe_price_id:subscription.items.data[0]?.price.id??null,status,
   trial_ends_at:unixDate(subscription.trial_end),current_period_ends_at:unixDate(periodEnd),
   cancel_at_period_end:subscription.cancel_at_period_end,updated_at:new Date().toISOString(),
  },{onConflict:"business_id"});
  if(error)return NextResponse.json({error:"Subscription state could not be saved."},{status:500});

  const active=status==="active"||status==="trialing",grace=status==="past_due";
  const endsAt=active?null:new Date().toISOString();
  const graceEndsAt=grace?new Date(Date.now()+7*86_400_000).toISOString():null;
  const {error:entitlementError}=await db.from("business_entitlements").update({
   entitlement_key:active||grace?"starter":"pilot",status:active?"active":grace?"grace_period":"expired",
   source:"billing_sync",ends_at:endsAt,grace_period_ends_at:graceEndsAt,
   metadata:{stripe_subscription_id:subscription.id,stripe_subscription_status:status},updated_at:new Date().toISOString(),
  }).eq("business_id",businessId).in("status",["active","grace_period","expired"]);
  if(entitlementError)return NextResponse.json({error:"Workspace access could not be synchronized."},{status:500});
 }
 return NextResponse.json({received:true});
}
