import type {PricingPlanKey} from "./catalog.ts";

export type PaidSubscriptionPlan="growth"|"scale";
export function isPaidSubscriptionPlan(value:string):value is PaidSubscriptionPlan{return value==="growth"||value==="scale";}
export function configuredSubscriptionPriceId(plan:PaidSubscriptionPlan){
 const value=plan==="growth"?process.env.STRIPE_SERVONAS_GROWTH_PRICE_ID:process.env.STRIPE_SERVONAS_SCALE_PRICE_ID;
 return value?.trim()||null;
}
export function subscriptionPlanPriceCents(plan:PricingPlanKey){return plan==="growth"?5_000:plan==="scale"?15_000:0;}
