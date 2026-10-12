import {activeGoogleAdsContext,type GoogleTag} from "./googleTag.ts";

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

// Booking conversion wiring stays inactive until a tenant conversion label is supplied.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Preserve the dormant booking hook API until tenant labels exist.
export function trackGoogleAdsBookingConversion(_bookingId:string,_value:number,_currency?:string){
 return false;
}

export function trackGoogleAdsSignupConversion(userId:string,eventCallback?:()=>void){
 if(activeGoogleAdsContext()?.scope!=="platform")return false;
 return trackGoogleAdsConversion(GOOGLE_ADS_SIGNUP_CONVERSION,{onceKey:`signup.${userId}`,eventCallback});
}
