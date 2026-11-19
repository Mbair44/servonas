import {stripePaymentsReady} from "./stripeConnect.ts";

type PaymentAccount={
  onboarding_status?:string|null;
  charges_enabled?:boolean|null;
  payouts_enabled?:boolean|null;
}|null|undefined;

/**
 * Party-rental payment policy is intentionally derived from the existing
 * tenant deposit setting: 0% means invoice later; any positive percentage
 * requires a ready connected Stripe account before an online reservation may
 * be created.
 */
export function rentalPublicPaymentPolicy(input:{
  depositPercent:number;
  stripeSecretConfigured:boolean;
  paymentAccount:PaymentAccount;
}){
  const depositPercent=Math.min(100,Math.max(0,Number.isFinite(input.depositPercent)?input.depositPercent:25));
  const requiresOnlineDeposit=depositPercent>0;
  const stripeReady=input.stripeSecretConfigured&&stripePaymentsReady(input.paymentAccount??{});
  return {
    depositPercent,
    requiresOnlineDeposit,
    allowsInvoiceLater:!requiresOnlineDeposit,
    onlinePaymentsReady:requiresOnlineDeposit&&stripeReady,
  };
}
