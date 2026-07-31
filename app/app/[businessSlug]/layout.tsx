import type {ReactNode} from "react";
import {requireWorkspace} from "@/lib/workspace";
import {formatTrialDate,platformBillingEnabled} from "@/lib/platformBilling";
import SubscriptionTrialBanner from "@/components/SubscriptionTrialBanner";

export default async function WorkspaceLayout({children,params}:{children:ReactNode;params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params;
 if(!platformBillingEnabled())return children;
 const {supabase,business,entitlementSummary}=await requireWorkspace(businessSlug);
 const {data:subscription,error}=await supabase.from("business_platform_subscriptions").select("status").eq("business_id",business.id).maybeSingle();
 if(error)console.error("Workspace subscription warning lookup failed",{businessId:business.id,code:error.code});
 const billingReady=subscription?.status==="active"||subscription?.status==="trialing";
 const deadline=entitlementSummary.entitlement?.ends_at;
 return <>{!billingReady&&deadline&&<SubscriptionTrialBanner businessSlug={businessSlug} deadline={deadline} deadlineLabel={formatTrialDate(deadline,business.timezone)}/>} {children}</>;
}
