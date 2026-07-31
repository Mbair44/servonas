import type {ReactNode} from "react";
import {requireWorkspace} from "@/lib/workspace";
import {formatTrialDate,platformBillingEnabled} from "@/lib/platformBilling";
import SubscriptionTrialBanner from "@/components/SubscriptionTrialBanner";

export default async function WorkspaceLayout({children,params}:{children:ReactNode;params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params;
 if(!platformBillingEnabled())return children;
 const {supabase,business,entitlementSummary}=await requireWorkspace(businessSlug);
 const {data:subscription,error}=await supabase.from("business_platform_subscriptions").select("status,trial_ends_at").eq("business_id",business.id).maybeSingle();
 if(error)console.error("Workspace subscription warning lookup failed",{businessId:business.id,code:error.code});
 const billingReady=subscription?.status==="active"||subscription?.status==="trialing";
 let deadline=subscription?.trial_ends_at??entitlementSummary.entitlement?.ends_at??null;
 if(!billingReady&&!deadline){
  const {data:provisionedDeadline,error:trialError}=await supabase.rpc("ensure_servonas_trial",{p_business_id:business.id,p_days:30});
  if(trialError)console.error("Workspace trial deadline provisioning failed",{businessId:business.id,code:trialError.code});
  deadline=provisionedDeadline??null;
 }
 return <>{!billingReady&&deadline&&<SubscriptionTrialBanner businessSlug={businessSlug} deadline={deadline} deadlineLabel={formatTrialDate(deadline,business.timezone)}/>} {children}</>;
}
