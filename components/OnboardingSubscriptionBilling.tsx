import {startServonasSubscription} from "@/app/onboarding/actions";
import {formatTrialDate,SERVONAS_TRIAL_DAYS} from "@/lib/platformBilling";

export default function OnboardingSubscriptionBilling({businessSlug,trialEndsAt,timeZone}:{businessSlug:string;trialEndsAt:string;timeZone:string}){
 const deadline=formatTrialDate(trialEndsAt,timeZone);
 return <section className="onboarding-subscription-card">
  <span className="sv-kicker">Servonas subscription</span>
  <h2>Your first {SERVONAS_TRIAL_DAYS} days are free</h2>
  <p>Add a payment method now and your Servonas subscription will begin automatically after the free trial. You will not be charged today.</p>
  <p><strong>Your free access ends {deadline}.</strong> If billing is not added by then, the workspace will be locked until a payment method is added. Your data will remain saved.</p>
  <form action={startServonasSubscription.bind(null,businessSlug,"onboarding")}><button className="sv-button">Add subscription billing</button></form>
  <small>You may skip this for now and add billing later from Business Settings before {deadline}.</small>
 </section>;
}
