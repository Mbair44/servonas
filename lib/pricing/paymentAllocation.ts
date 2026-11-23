export const PAYMENT_ALLOCATION_VERSION = 1;
export const feeEnabledPaymentFlows = ["public_rental_checkout","booking_deposit","booking_balance","invoice","payment_link","smart_upsell","booking_amendment","recurring_off_session"] as const;
export type FeeEnabledPaymentFlow = typeof feeEnabledPaymentFlows[number];
export type EligiblePaymentAllocation = { version: 1; flow: FeeEnabledPaymentFlow; currency: string; expectedPaymentCents: number; eligibleChargeCents: number|null; eligibleTaxCents: number|null; taxSplitStatus:"available"|"unavailable"; prohibitedTipsCents: 0; prohibitedRefundableSecurityDepositCents: 0; prohibitedOverpaymentCents: 0 };
export function validateEligiblePaymentAllocation(value: EligiblePaymentAllocation) {
 const ints=[value.expectedPaymentCents,value.prohibitedTipsCents,value.prohibitedRefundableSecurityDepositCents,value.prohibitedOverpaymentCents,...(value.taxSplitStatus==="available"?[value.eligibleChargeCents,value.eligibleTaxCents]:[])];
 if (!ints.every((v):v is number=>typeof v==="number"&&Number.isSafeInteger(v)) || ints.some(v=>(v as number)<0) || value.expectedPaymentCents<=0) throw new Error("Payment allocation amounts must be positive integer cents.");
 if (!/^[A-Z]{3}$/.test(value.currency)) throw new Error("Payment allocation currency is invalid.");
 if (!(feeEnabledPaymentFlows as readonly string[]).includes(value.flow)) throw new Error("Payment allocation flow is invalid.");
 if (value.prohibitedTipsCents!==0||value.prohibitedRefundableSecurityDepositCents!==0||value.prohibitedOverpaymentCents!==0) throw new Error("Tips, refundable security deposits, and overpayments are not supported in fee-enabled payments.");
 if (value.taxSplitStatus==="available"&&(value.eligibleChargeCents===null||value.eligibleTaxCents===null||value.eligibleChargeCents+value.eligibleTaxCents!==value.expectedPaymentCents)) throw new Error("Payment allocation does not reconcile to the expected charge.");
 if(value.taxSplitStatus==="unavailable"&&(value.eligibleChargeCents!==null||value.eligibleTaxCents!==null))throw new Error("Unavailable tax splits must not invent component amounts.");
 return value;
}
export function combinedEligibleAllocation(flow:FeeEnabledPaymentFlow,expectedPaymentCents:number,currency="USD"):EligiblePaymentAllocation{return validateEligiblePaymentAllocation({version:1,flow,currency,expectedPaymentCents,eligibleChargeCents:null,eligibleTaxCents:null,taxSplitStatus:"unavailable",prohibitedTipsCents:0,prohibitedRefundableSecurityDepositCents:0,prohibitedOverpaymentCents:0});}
