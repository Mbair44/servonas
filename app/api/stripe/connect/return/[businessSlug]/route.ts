import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { stripeConnectBaseUrl,stripeProviderError,syncStripeConnectAccount } from "@/lib/stripeConnect";

export const runtime="nodejs";
const settingsUrl=(slug:string,kind:"success"|"error",message:string)=>`${stripeConnectBaseUrl()}/app/${encodeURIComponent(slug)}/settings?${kind}=${encodeURIComponent(message)}#payments`;

export async function GET(_request:Request,{params}:{params:Promise<{businessSlug:string}>}){
  const {businessSlug}=await params;
  const {supabase,business,role}=await requireWorkspace(businessSlug);
  if(!canManageBusiness(role))return NextResponse.redirect(settingsUrl(businessSlug,"error","Only owners and admins can manage Stripe"));
  const {data:paymentAccount}=await supabase.from("business_payment_accounts").select("provider_account_id")
    .eq("business_id",business.id).eq("provider","stripe").maybeSingle();
  if(!paymentAccount?.provider_account_id)return NextResponse.redirect(settingsUrl(businessSlug,"error","Stripe account was not found"));
  try{
    const state=await syncStripeConnectAccount(supabase,business.id,paymentAccount.provider_account_id);
    const message=state.onboarding_status==="complete"?"Stripe onboarding complete":"Stripe information saved; additional requirements remain";
    return NextResponse.redirect(settingsUrl(businessSlug,"success",message));
  }catch(error){
    const detail=stripeProviderError(error);
    console.error("Stripe Connect return sync failed",{businessId:business.id,accountId:paymentAccount.provider_account_id,...detail});
    return NextResponse.redirect(settingsUrl(businessSlug,"error",`Stripe status refresh failed: ${detail.message}`));
  }
}
