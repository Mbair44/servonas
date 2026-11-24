import {PLATFORM_FEE_MONTHLY_CAP_CENTS,STARTER_MANUAL_BOOKING_LIMIT,isPricingPlanKey,pricingPlanCatalog,type PricingPlanKey} from "./catalog.ts";

export type BillingSummary={
 planKey:PricingPlanKey;subscriptionStatus:string|null;monthlyPriceCents:number|null;
 cycleStartsAt:string|null;cycleEndsAt:string|null;eligiblePaymentVolumeCents:number;capturedPlatformFeesCents:number;remainingPlatformFeeCapCents:number|null;
 manualBookingUsed:number|null;manualBookingLimit:number|null;cancelAtPeriodEnd:boolean;
 communicationDowngradeBlocked?:boolean;activeCommunicationResources?:number;
};

export function buildBillingSummary(input:{planKey?:string|null;rolloutEnabled?:boolean|null;subscription?:{status?:string|null;current_period_ends_at?:string|null;cancel_at_period_end?:boolean|null}|null;cycle?:{cycle_starts_at?:string|null;cycle_ends_at?:string|null;captured_cents?:number|string|null}|null;eligiblePaymentVolumeCents?:number|string|null;manualBookingUsed?:number|null;activeCommunicationResources?:number}) :BillingSummary{
 const requestedPlan=input.planKey??"";
 const planKey:PricingPlanKey=isPricingPlanKey(requestedPlan)&&input.rolloutEnabled===true?requestedPlan:"legacy";
 const plan=pricingPlanCatalog[planKey],captured=Number(input.cycle?.captured_cents??0),eligible=Number(input.eligiblePaymentVolumeCents??0);
 const isMetered=plan.platformFeeEnabled;
 return {planKey,subscriptionStatus:input.subscription?.status??null,monthlyPriceCents:plan.monthlyPriceCents,
  cycleStartsAt:input.cycle?.cycle_starts_at??null,cycleEndsAt:input.cycle?.cycle_ends_at??input.subscription?.current_period_ends_at??null,
  eligiblePaymentVolumeCents:Number.isFinite(eligible)?eligible:0,capturedPlatformFeesCents:Number.isFinite(captured)?captured:0,
  remainingPlatformFeeCapCents:isMetered?Math.max(0,PLATFORM_FEE_MONTHLY_CAP_CENTS-(Number.isFinite(captured)?captured:0)):null,
  manualBookingUsed:planKey==="starter"?input.manualBookingUsed??0:null,manualBookingLimit:planKey==="starter"?STARTER_MANUAL_BOOKING_LIMIT:null,
  cancelAtPeriodEnd:input.subscription?.cancel_at_period_end===true,
  activeCommunicationResources:input.activeCommunicationResources??0,communicationDowngradeBlocked:(input.activeCommunicationResources??0)>0,
 };
}
