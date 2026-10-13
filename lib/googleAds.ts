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
  if(storageKey&&window.sessionStorage.getItem(storageKey)==="sent")return false;
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
  if(storageKey)window.sessionStorage.setItem(storageKey,"sent");
  return true;
 }catch{return false;}
}

/** Fires one tenant purchase conversion using an immutable Servonas booking ID. */
export function trackGoogleAdsBookingConversion(input:GoogleAdsBookingConversion){
 const destination=normalizeGoogleAdsConversionDestination(input.destination);
 if(!destination||!input.bookingId||!Number.isFinite(input.value)||input.value<0)return false;
 return trackGoogleAdsConversion({sendTo:destination,value:input.value,currency:input.currency??"USD",transactionId:input.bookingId});
}

export function trackGoogleAdsSignupConversion(userId:string,eventCallback?:()=>void){
 if(activeGoogleAdsContext()?.scope!=="platform")return false;
 return trackGoogleAdsConversion(GOOGLE_ADS_SIGNUP_CONVERSION,{onceKey:`signup.${userId}`,eventCallback});
}
