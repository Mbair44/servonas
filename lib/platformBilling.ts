export const SERVONAS_TRIAL_DAYS=30;

export function servonasTrialDays(){
 const configured=Number(process.env.SERVONAS_TRIAL_DAYS);
 return Number.isInteger(configured)&&configured>=1&&configured<=365?configured:SERVONAS_TRIAL_DAYS;
}

export function platformBillingEnabled(){
 return process.env.SERVONAS_SUBSCRIPTION_BILLING_ENABLED==="true";
}

export function trialEndDate(from=new Date()){
 return new Date(from.getTime()+servonasTrialDays()*86_400_000);
}

export function formatTrialDate(value:string|Date,timeZone="America/Phoenix"){
 return new Intl.DateTimeFormat("en-US",{dateStyle:"long",timeZone}).format(new Date(value));
}
