/**
 * Reserved boundary for reconciliation-driven Stripe repair.
 * Webhooks remain the sole caller of payment fulfillment until the existing
 * rental and invoice fulfillment paths share this idempotent implementation.
 */
export type StripeRepairRequest={businessId:string;bookingId:string;paymentIntentId:string;connectedAccountId:string};
export type StripeRepairResult={enabled:false;reason:"stripe_repair_not_enabled"};

export async function repairStripePayment(_request:StripeRepairRequest):Promise<StripeRepairResult>{
 return {enabled:false,reason:"stripe_repair_not_enabled"};
}
