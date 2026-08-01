import {NextResponse} from "next/server";
import {stripeClient,stripeConnectBaseUrl} from "@/lib/stripeConnect";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export const runtime="nodejs";

export async function GET(request:Request){
 const sessionId=new URL(request.url).searchParams.get("session_id");
 const base=stripeConnectBaseUrl(),db=getSupabaseAdmin();
 if(!sessionId||!db)return NextResponse.redirect(`${base}/app`);
 try{
  const stripe=stripeClient();
  const session=await stripe.checkout.sessions.retrieve(sessionId,{expand:["subscription"]});
  const businessId=session.metadata?.business_id,slug=session.metadata?.business_slug,source=session.metadata?.return_source;
  if(session.metadata?.purpose!=="servonas_subscription"||!businessId||!slug)throw new Error("Invalid subscription return session.");
  const subscription=typeof session.subscription==="string"?await stripe.subscriptions.retrieve(session.subscription):session.subscription;
  if(!subscription)throw new Error("Stripe did not return the subscription.");
  const periodEnd=(subscription as typeof subscription&{current_period_end?:number}).current_period_end;
  const {error}=await db.from("business_platform_subscriptions").update({
   stripe_subscription_id:subscription.id,stripe_price_id:subscription.items.data[0]?.price.id??null,
   status:subscription.status,trial_ends_at:subscription.trial_end?new Date(subscription.trial_end*1000).toISOString():null,
   current_period_ends_at:periodEnd?new Date(periodEnd*1000).toISOString():null,
   cancel_at_period_end:subscription.cancel_at_period_end,updated_at:new Date().toISOString(),
  }).eq("business_id",businessId).eq("stripe_checkout_session_id",session.id);
  if(error)throw new Error(`Subscription confirmation could not be saved (${error.code}).`);
  const destination=source==="onboarding"?`/onboarding?business=${encodeURIComponent(slug)}`:`/app/${encodeURIComponent(slug)}/settings?success=${encodeURIComponent("Subscription billing updated.")}`;
  return NextResponse.redirect(`${base}${destination}`);
 }catch(error){
  console.error("Servonas subscription return failed",{sessionId,message:error instanceof Error?error.message:"Unknown error"});
  return NextResponse.redirect(`${base}/app?error=${encodeURIComponent("Subscription confirmation could not be verified. Check Stripe and retry.")}`);
 }
}
