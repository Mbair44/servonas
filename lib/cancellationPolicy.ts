export const DEFAULT_CANCELLATION_POLICY = `Cancellation Policy

Customer may cancel anytime. Payments are non-refundable but become credit toward another booking for up to 1 year from the original event date. Future booking is subject to availability and current pricing; customer pays any difference. Credit has no cash value.`;
export type CancellationPolicy = {cancellation_policy_enabled?:boolean;cancellation_policy_text?:string;require_cancellation_acknowledgment?:boolean};
export function cancellationPolicyError(policy:CancellationPolicy|null, accepted:unknown, snapshot:unknown):string|null {
 if(!policy?.cancellation_policy_enabled)return null;
 if(snapshot!==policy.cancellation_policy_text)return "The cancellation policy has changed. Refresh checkout and review it before continuing.";
 if(policy.require_cancellation_acknowledgment&&accepted!==true&&accepted!=="true")return "Please acknowledge the cancellation policy before continuing.";
 return null;
}
