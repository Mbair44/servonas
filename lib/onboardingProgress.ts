export const ONBOARDING_STEPS=["welcome","company","profile","hours","service","readiness"] as const;
export type OnboardingStep=typeof ONBOARDING_STEPS[number];
export type OnboardingStatus="not_started"|"in_progress"|"completed"|"reopened";
export type OnboardingProgressInput={status:OnboardingStatus;currentStep:number;completedSteps:string[]};
export type OnboardingProgress={
 percentage:number;currentStep:number;currentStepKey:OnboardingStep;requiredItems:Array<{key:OnboardingStep;complete:boolean}>;
 recommendedItems:Array<{key:"logo"|"website";complete:boolean}>;suggestedNextAction:string;
};
export function calculateOnboardingProgress(input:OnboardingProgressInput,optional:{logo?:boolean;website?:boolean}={}):OnboardingProgress{
 const completed=new Set(input.completedSteps.filter(step=>ONBOARDING_STEPS.includes(step as OnboardingStep)));
 const requiredItems=ONBOARDING_STEPS.map(key=>({key,complete:completed.has(key)}));
 const firstIncomplete=Math.max(0,requiredItems.findIndex(item=>!item.complete));
 const currentStep=input.status==="completed"?ONBOARDING_STEPS.length:Math.min(ONBOARDING_STEPS.length,Math.max(1,input.currentStep||firstIncomplete+1));
 const next=requiredItems.find(item=>!item.complete)?.key;
 return {
  percentage:Math.round((requiredItems.filter(item=>item.complete).length/ONBOARDING_STEPS.length)*100),
  currentStep,currentStepKey:ONBOARDING_STEPS[Math.min(currentStep-1,ONBOARDING_STEPS.length-1)],
  requiredItems,recommendedItems:[{key:"logo",complete:Boolean(optional.logo)},{key:"website",complete:Boolean(optional.website)}],
  suggestedNextAction:next?`Complete ${next.replaceAll("_"," ")} setup`:"Import employees or customers",
 };
}
export function shouldRequireOnboarding(input:{stateExists:boolean;status?:OnboardingStatus|null}){
 return input.stateExists&&input.status!=="completed";
}
