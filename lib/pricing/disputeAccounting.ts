export type DisputeAdjustment={type:"dispute_fee_reversal"|"dispute_fee_recovery";amountCents:number}|null;

/** Compare Stripe's authoritative ApplicationFee.amount_refunded with amounts
 * already represented by customer-refund and dispute ledger entries. */
export function determineDisputeAdjustment(input:{capturedFeeCents:number;customerRefundedFeeCents:number;recordedDisputeNetCents:number;stripeApplicationFeeRefundedCents:number}):DisputeAdjustment{
 const values=Object.values(input);
 if(values.some(value=>!Number.isInteger(value)||value<0)||input.customerRefundedFeeCents+input.recordedDisputeNetCents>input.capturedFeeCents||input.stripeApplicationFeeRefundedCents>input.capturedFeeCents)throw new Error("Invalid dispute accounting evidence.");
 const recorded=input.customerRefundedFeeCents+input.recordedDisputeNetCents;
 if(input.stripeApplicationFeeRefundedCents===recorded)return null;
 if(input.stripeApplicationFeeRefundedCents>recorded)return {type:"dispute_fee_reversal",amountCents:input.stripeApplicationFeeRefundedCents-recorded};
 return {type:"dispute_fee_recovery",amountCents:recorded-input.stripeApplicationFeeRefundedCents};
}
