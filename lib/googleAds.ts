import {activeGoogleAdsContext,updateGoogleAdsConsent,type GoogleTag} from "./googleTag.ts";

export const GOOGLE_ADS_SIGNUP_CONVERSION =
 process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION ??
 "AW-18340749438/-fjTCKncxtscEP7AxqlE";

type GoogleAdsConversionOptions={
 onceKey?:string;
 eventCallback?:()=>void;
 value?:number;
 currency?:string;
 transactionId?:string;
};
type TenantGoogleAdsConversion=GoogleAdsConversionOptions & {sendTo:string};
type GoogleAdsBookingConversion={bookingId:string;destination:string;value:number;currency?:string};
export type GoogleAdsConversionPayload={send_to:string;value:number;currency:string;transaction_id:string};
export type GoogleAdsPaidBooking={id?:unknown;status?:unknown;total_cents?:unknown;amount_paid_cents?:unknown;paid_at?:unknown};

/** A purchase event must be backed by the same payment evidence as checkout. */
export function verifiedGoogleAdsPaidBooking(booking:GoogleAdsPaidBooking|null|undefined):{bookingId:string;totalCents:number}|null{
 if(!booking||booking.status!=="confirmed"||typeof booking.id!=="string"||!booking.id||typeof booking.paid_at!=="string"||!booking.paid_at)return null;
 const totalCents=Number(booking.total_cents),amountPaidCents=Number(booking.amount_paid_cents);
 if(!Number.isSafeInteger(totalCents)||totalCents<0||!Number.isFinite(amountPaidCents)||amountPaidCents<=0)return null;
 return {bookingId:booking.id,totalCents};
}

export function normalizeGoogleAdsConversionDestination(value:unknown,tagId?:unknown):string|null{
 if(typeof value!=="string")return null;
 const destination=value.trim(),match=/^(AW-[0-9]{6,20})\/([A-Za-z0-9_-]{1,200})$/.exec(destination);
 if(!match)return null;
 return tagId==null||match[1]===tagId?destination:null;
}

/** No booking label is configured here. The destination must match the active tenant. */
export function trackGoogleAdsConversion(input:string|TenantGoogleAdsConversion,options:GoogleAdsConversionOptions={}){
 const sendTo=typeof input==="string"?input:input.sendTo;
 const details=typeof input==="string"?options:input;
 const context=activeGoogleAdsContext();
 const match=/^(AW-[0-9]{6,20})\/([A-Za-z0-9_-]+)$/.exec(sendTo??"");
 if(!context||!match||match[1]!==context.tagId)return false;
 const onceKey=details.transactionId||details.onceKey;
 const storageKey=onceKey?`servonas.google-ads-conversion.${context.scope}.${sendTo}.${onceKey}`:null;
 try{
  if(storageKey&&(window.sessionStorage.getItem(storageKey)==="sent"||window.localStorage.getItem(storageKey)==="sent"))return false;
  const gtag=(window as typeof window & {gtag?:GoogleTag}).gtag;
  if(typeof gtag!=="function")return false;
  updateGoogleAdsConsent();
  gtag("event","conversion",{
   send_to:sendTo,
   ...(details.eventCallback?{event_callback:details.eventCallback}:{}),
   ...(typeof details.value==="number"&&Number.isFinite(details.value)?{value:details.value}:{}),
   ...(details.currency?{currency:details.currency}:{}),
   ...(details.transactionId?{transaction_id:details.transactionId}:{}),
  });
  if(storageKey){window.sessionStorage.setItem(storageKey,"sent");try{window.localStorage.setItem(storageKey,"sent");}catch{/* Google transaction_id remains the cross-browser fallback. */}}
  return true;
 }catch{return false;}
}

/** Builds the provider payload without contacting Google; useful for safe staging diagnostics. */
export function buildGoogleAdsBookingConversionPayload(input:GoogleAdsBookingConversion):GoogleAdsConversionPayload|null{
 const destination=normalizeGoogleAdsConversionDestination(input.destination);
 if(!destination||!input.bookingId||!Number.isFinite(input.value)||input.value<0)return null;
 return {send_to:destination,value:input.value,currency:input.currency??"USD",transaction_id:input.bookingId};
}

/** Fires one tenant purchase conversion using an immutable Servonas booking ID. */
export function trackGoogleAdsBookingConversion(input:GoogleAdsBookingConversion){
 const payload=buildGoogleAdsBookingConversionPayload(input);
 if(!payload)return false;
 const sent=trackGoogleAdsConversion({sendTo:payload.send_to,value:payload.value,currency:payload.currency,transactionId:payload.transaction_id});
 if(sent&&process.env.NEXT_PUBLIC_GOOGLE_ADS_DIAGNOSTICS==="true"&&typeof window!=="undefined"){
  window.dispatchEvent(new CustomEvent("servonas:google-ads-conversion",{detail:payload}));
 }
 return sent;
}

export function trackGoogleAdsSignupConversion(userId:string,eventCallback?:()=>void){
 if(activeGoogleAdsContext()?.scope!=="platform")return false;
 return trackGoogleAdsConversion(GOOGLE_ADS_SIGNUP_CONVERSION,{onceKey:`signup.${userId}`,eventCallback});
}
