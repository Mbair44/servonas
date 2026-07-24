import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StripeConnectState={
  onboarding_status:"not_started"|"pending"|"restricted"|"complete"|"disabled";
  charges_enabled:boolean;
  payouts_enabled:boolean;
  details_submitted:boolean;
  default_currency:string;
  country:string;
  requirements_currently_due:string[];
  requirements_eventually_due:string[];
  requirements_past_due:string[];
  disabled_reason:string|null;
  capabilities:Record<string,string>;
  provider_created_at:string;
  last_provider_sync_at:string;
  last_provider_error:null;
};

export function stripePaymentsReady(account:{
  onboarding_status?:string|null;
  charges_enabled?:boolean|null;
  payouts_enabled?:boolean|null;
}){
  return account.onboarding_status==="complete"&&account.charges_enabled===true&&account.payouts_enabled===true;
}

export function stripeConnectState(account:Stripe.Account):StripeConnectState{
  const currentlyDue=account.requirements?.currently_due??[];
  const eventuallyDue=account.requirements?.eventually_due??[];
  const pastDue=account.requirements?.past_due??[];
  const disabledReason=account.requirements?.disabled_reason??null;
  const ready=Boolean(account.details_submitted&&account.charges_enabled&&account.payouts_enabled&&!disabledReason&&!currentlyDue.length&&!pastDue.length);
  const restricted=Boolean(disabledReason||pastDue.length);
  return {
    onboarding_status:ready?"complete":restricted?"restricted":"pending",
    charges_enabled:Boolean(account.charges_enabled),
    payouts_enabled:Boolean(account.payouts_enabled),
    details_submitted:Boolean(account.details_submitted),
    default_currency:(account.default_currency||"usd").toUpperCase(),
    country:(account.country||"US").toUpperCase(),
    requirements_currently_due:currentlyDue,
    requirements_eventually_due:eventuallyDue,
    requirements_past_due:pastDue,
    disabled_reason:disabledReason,
    capabilities:{...(account.capabilities??{})},
    provider_created_at:new Date((account.created??Math.floor(Date.now()/1000))*1000).toISOString(),
    last_provider_sync_at:new Date().toISOString(),
    last_provider_error:null,
  };
}

export function stripeClient(){
  const key=process.env.STRIPE_SECRET_KEY;
  if(!key)throw new Error("STRIPE_SECRET_KEY is not configured.");
  return new Stripe(key);
}

export function stripeConnectBaseUrl(){
  const configured=process.env.NEXT_PUBLIC_SITE_URL;
  if(!configured)throw new Error("NEXT_PUBLIC_SITE_URL is not configured.");
  const url=new URL(configured);
  if(url.protocol!=="https:"&&url.hostname!=="localhost")throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS.");
  return url.origin;
}

export async function syncStripeConnectAccount(
  supabase:SupabaseClient,
  businessId:string,
  providerAccountId:string,
  stripe=stripeClient(),
){
  const account=await stripe.accounts.retrieve(providerAccountId);
  if("deleted" in account&&account.deleted)throw new Error("The Stripe connected account was deleted.");
  const state=stripeConnectState(account as Stripe.Account);
  const {error}=await supabase.from("business_payment_accounts").update(state)
    .eq("business_id",businessId).eq("provider","stripe").eq("provider_account_id",providerAccountId);
  if(error)throw new Error(`Stripe account status could not be saved (${error.code}).`);
  return state;
}

export async function createStripeOnboardingLink(providerAccountId:string,businessSlug:string,stripe=stripeClient()){
  const base=stripeConnectBaseUrl();
  const slug=encodeURIComponent(businessSlug);
  return stripe.accountLinks.create({
    account:providerAccountId,
    refresh_url:`${base}/api/stripe/connect/refresh/${slug}`,
    return_url:`${base}/api/stripe/connect/return/${slug}`,
    type:"account_onboarding",
    collection_options:{fields:"eventually_due"},
  });
}

export function stripeProviderError(error:unknown){
  if(error instanceof Stripe.errors.StripeError)return {
    type:error.type,code:error.code??null,message:error.message,statusCode:error.statusCode??null,
  };
  return {type:error instanceof Error?error.name:"unknown",code:null,message:error instanceof Error?error.message:"Unknown Stripe error",statusCode:null};
}
