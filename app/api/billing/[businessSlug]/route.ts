import {NextResponse} from "next/server";
import {canManageBusiness} from "@/lib/access";
import {buildBillingSummary} from "@/lib/pricing/billingSummary";
import {configuredSubscriptionPriceId,isPaidSubscriptionPlan,type PaidSubscriptionPlan} from "@/lib/pricing/subscriptionPlans";
import {stripeClient} from "@/lib/stripeConnect";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {requireWorkspace} from "@/lib/workspace";

export const runtime="nodejs";
const activeStatuses=new Set(["trialing","active","past_due","paused"]);
const periodEnd=(subscription:{current_period_end?:number})=>subscription.current_period_end?new Date(subscription.current_period_end*1000).toISOString():null;
const unixDate=(value:number|null)=>value?new Date(value*1000).toISOString():null;
const planForPrice=(priceId:string|null):PaidSubscriptionPlan|null=>priceId===configuredSubscriptionPriceId("growth")?"growth":priceId===configuredSubscriptionPriceId("scale")?"scale":null;

async function context(slug:string){
 const workspace=await requireWorkspace(slug,{suppressPlatformAdminAudit:true});
 if(!canManageBusiness(workspace.role))return {error:NextResponse.json({error:"Only owners and administrators can manage billing."},{status:403})};
 return {workspace};
}

export async function GET(_:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,access=await context(businessSlug);if("error" in access)return access.error;
 const {supabase,business}=access.workspace;
 const [{data:profile},{data:subscription},{data:cycle},{data:usage},{count:activeNumbers}]=await Promise.all([
  supabase.from("business_pricing_profiles").select("plan_key,rollout_enabled,billing_anchor_at").eq("business_id",business.id).maybeSingle(),
  supabase.from("business_platform_subscriptions").select("status,current_period_ends_at,cancel_at_period_end").eq("business_id",business.id).maybeSingle(),
  supabase.from("platform_fee_cycles").select("id,cycle_starts_at,cycle_ends_at,captured_cents").eq("business_id",business.id).order("cycle_starts_at",{ascending:false}).limit(1).maybeSingle(),
  supabase.from("manual_booking_usage_ledger").select("id").eq("business_id",business.id).in("state",["reserved","consumed"]),
  supabase.from("twilio_phone_numbers").select("id",{count:"exact",head:true}).eq("business_id",business.id).eq("status","active").eq("provisioning_status","active"),
 ]);
 const eligible=cycle?await supabase.from("platform_fee_ledger").select("eligible_amount_cents").eq("business_id",business.id).eq("cycle_id",cycle.id):{data:[]};
 const eligiblePaymentVolumeCents=(eligible.data??[]).reduce((sum:any,row:any)=>sum+Number(row.eligible_amount_cents??0),0);
 return NextResponse.json(buildBillingSummary({planKey:profile?.plan_key,rolloutEnabled:profile?.rollout_enabled,subscription,cycle,eligiblePaymentVolumeCents,manualBookingUsed:usage?.length??0,activeCommunicationResources:activeNumbers??0}),{headers:{"Cache-Control":"no-store"}});
}

export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,access=await context(businessSlug);if("error" in access)return access.error;
 const {supabase,business}=access.workspace;
 let body:{action?:string;plan?:string};try{body=await request.json();}catch{return NextResponse.json({error:"Invalid billing request."},{status:400});}
 const {data:record}=await supabase.from("business_platform_subscriptions").select("stripe_subscription_id,stripe_customer_id").eq("business_id",business.id).maybeSingle();
 if(!record?.stripe_subscription_id)return NextResponse.json({error:"No completed subscription is available to manage."},{status:409});
 try{
  const stripe=stripeClient();let subscription=await stripe.subscriptions.retrieve(record.stripe_subscription_id);
  if(subscription.metadata.business_id!==business.id||subscription.metadata.platform!=="servonas")return NextResponse.json({error:"Stripe subscription ownership could not be verified."},{status:409});
  if(body.action==="change_plan"){
   if(!isPaidSubscriptionPlan(body.plan??""))return NextResponse.json({error:"Choose Growth or Scale."},{status:400});
   const priceId=configuredSubscriptionPriceId(body.plan as PaidSubscriptionPlan);if(!priceId)return NextResponse.json({error:"Subscription plan is not configured."},{status:503});
   const item=subscription.items.data[0];if(!item)return NextResponse.json({error:"Stripe subscription has no billable item."},{status:409});
   subscription=await stripe.subscriptions.update(subscription.id,{cancel_at_period_end:false,items:[{id:item.id,price:priceId}],proration_behavior:"create_prorations",metadata:{...subscription.metadata,business_id:business.id,platform:"servonas",plan_key:body.plan as PaidSubscriptionPlan}});
  }else if(body.action==="cancel")subscription=await stripe.subscriptions.update(subscription.id,{cancel_at_period_end:true});
  else if(body.action==="reactivate")subscription=await stripe.subscriptions.update(subscription.id,{cancel_at_period_end:false});
  else if(body.action!=="sync")return NextResponse.json({error:"Unknown billing action."},{status:400});
  const stripePriceId=subscription.items.data[0]?.price.id??null;
  const admin=getSupabaseAdmin();
  const {data:priceMapping}=admin&&stripePriceId?await admin.from("servonas_subscription_plan_prices").select("plan_key").eq("stripe_price_id",stripePriceId).eq("active",true).maybeSingle():{data:null};
  const planKey=priceMapping?.plan_key==="growth"||priceMapping?.plan_key==="scale"?priceMapping.plan_key:planForPrice(stripePriceId);
  const {error}=await supabase.from("business_platform_subscriptions").upsert({business_id:business.id,stripe_customer_id:typeof subscription.customer==="string"?subscription.customer:subscription.customer.id,stripe_subscription_id:subscription.id,stripe_price_id:stripePriceId,plan_key:planKey,status:subscription.status,trial_ends_at:unixDate(subscription.trial_end),current_period_ends_at:periodEnd(subscription),cancel_at_period_end:subscription.cancel_at_period_end,updated_at:new Date().toISOString()},{onConflict:"business_id"});
  if(error)throw new Error("Subscription state could not be saved.");
  // Only Stripe's retrieved state can alter an enrolled tenant's entitlement.
  if(admin&&planKey){const {data:profile}=await admin.from("business_pricing_profiles").select("plan_key,rollout_enabled").eq("business_id",business.id).maybeSingle();if(profile?.rollout_enabled===true&&profile.plan_key!=="legacy"){const active=activeStatuses.has(subscription.status)&&subscription.status!=="past_due",grace=subscription.status==="past_due";await admin.from("business_entitlements").update({entitlement_key:active||grace?planKey:"pilot",status:active?"active":grace?"grace_period":"expired",ends_at:active?null:new Date().toISOString(),grace_period_ends_at:grace?new Date(Date.now()+7*86_400_000).toISOString():null,source:"billing_sync",metadata:{stripe_subscription_id:subscription.id,stripe_subscription_status:subscription.status},updated_at:new Date().toISOString()}).eq("business_id",business.id).in("status",["active","grace_period","expired"]);}}
  return NextResponse.json({ok:true,status:subscription.status,cancelAtPeriodEnd:subscription.cancel_at_period_end});
 }catch(error){console.error("Tenant billing subscription management failed",{businessId:business.id,action:body.action,message:error instanceof Error?error.message:"Unknown error"});return NextResponse.json({error:"Stripe could not update this subscription."},{status:502});}
}
