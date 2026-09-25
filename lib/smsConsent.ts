export const WEB_BOOKING_SMS_CONSENT_VERSION="2026-09-14";

export const webBookingSmsConsentDisclosure=(businessName:string)=>
 `I agree to receive SMS messages from ${businessName} about my booking, including confirmations, reminders, delivery/setup updates, and customer support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase.`;

export type SmsConsentStatus="unknown"|"inbound_contact"|"express"|"opted_out"|null|undefined;
export type SmsConsentResolution={canSendSms:boolean;display:"Opted in"|"Not opted in"|"Opted out"|"Consent record incomplete";reason:"current_explicit_consent"|"phone_missing"|"opted_out"|"customer_not_express"|"ledger_not_express"};
export const resolveCurrentSmsConsent=(input:{phone:string|null|undefined;customerStatus:SmsConsentStatus;ledgerStatus:SmsConsentStatus}):SmsConsentResolution=>{
 if(!input.phone)return{canSendSms:false,display:"Not opted in",reason:"phone_missing"};
 if(input.customerStatus==="opted_out"||input.ledgerStatus==="opted_out")return{canSendSms:false,display:"Opted out",reason:"opted_out"};
 if(input.customerStatus!=="express"&&input.ledgerStatus!=="express")return{canSendSms:false,display:"Not opted in",reason:"customer_not_express"};
 if(input.customerStatus!=="express"||input.ledgerStatus!=="express")return{canSendSms:false,display:"Consent record incomplete",reason:input.customerStatus!=="express"?"customer_not_express":"ledger_not_express"};
 return{canSendSms:true,display:"Opted in",reason:"current_explicit_consent"};
};
