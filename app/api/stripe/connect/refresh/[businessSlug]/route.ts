import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { createStripeOnboardingLink,stripeConnectBaseUrl,stripeClient,stripeProviderError } from "@/lib/stripeConnect";

export const runtime="nodejs";
const settingsUrl=(slug:string,message:string)=>`${stripeConnectBaseUrl()}/app/${encodeURIComponent(slug)}/settings?error=${encodeURIComponent(message)}#payments`;

export async function GET(_request:Request,{params}:{params:Promise<{businessSlug:string}>}){
  const {businessSlug}=await params;
  const {supabase,business,role}=await requireWorkspace(businessSlug);
  if(!canManageBusiness(role))return NextResponse.redirect(settingsUrl(businessSlug,"Only owners and admins can manage Stripe"));
  const {data:paymentAccount}=await supabase.from("business_payment_accounts").select("provider_account_id")
    .eq("business_id",business.id).eq("provider","stripe").maybeSingle();
  if(!paymentAccount?.provider_account_id)return NextResponse.redirect(settingsUrl(businessSlug,"Stripe account was not found"));
  try{
    const link=await createStripeOnboardingLink(paymentAccount.provider_account_id,businessSlug,stripeClient());
    return NextResponse.redirect(link.url);
  }catch(error){
    const detail=stripeProviderError(error);
    console.error("Stripe Connect refresh link failed",{businessId:business.id,accountId:paymentAccount.provider_account_id,...detail});
    return NextResponse.redirect(settingsUrl(businessSlug,`Stripe onboarding could not resume: ${detail.message}`));
  }
}
