export const DEFAULT_CANCELLATION_POLICY = `Cancellation Policy

A 50% deposit is required to reserve your rental date and equipment. All deposits are non-refundable if you cancel your reservation for any reason.

If you need to reschedule, please contact us as soon as possible. Rescheduling is subject to availability and approval by the business.

If the business must cancel because of unsafe weather, equipment problems, or another issue on its side, it will work with the customer to reschedule or refund any applicable payments.`;
export type CancellationPolicy = {cancellation_policy_enabled?:boolean;cancellation_policy_text?:string;require_cancellation_acknowledgment?:boolean};
export function cancellationPolicyError(policy:CancellationPolicy|null, accepted:unknown, snapshot:unknown):string|null {
 if(!policy?.cancellation_policy_enabled)return null;
 if(snapshot!==policy.cancellation_policy_text)return "The cancellation policy has changed. Refresh checkout and review it before continuing.";
 if(policy.require_cancellation_acknowledgment&&accepted!==true&&accepted!=="true")return "Please acknowledge the cancellation policy before continuing.";
 return null;
}
