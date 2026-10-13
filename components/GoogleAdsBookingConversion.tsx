"use client";
import {useEffect,useState} from "react";
import {trackGoogleAdsBookingConversion} from "@/lib/googleAds";

/** Client-only because Google's gtag purchase event must share public-site consent. */
export function GoogleAdsBookingConversion({bookingId,destination,totalCents,currency="USD",confirmed=true,confirmationStatusUrl}:{bookingId:string;destination:string|null;totalCents:number;currency?:string;confirmed?:boolean;confirmationStatusUrl?:string|null}){
 const [isConfirmed,setIsConfirmed]=useState(confirmed);
 const [sendAttempt,setSendAttempt]=useState(0);
 useEffect(()=>{setIsConfirmed(confirmed);},[confirmed]);
 useEffect(()=>{const retry=()=>setSendAttempt(attempt=>attempt+1);window.addEventListener("servonas:analytics-consent-updated",retry);return()=>window.removeEventListener("servonas:analytics-consent-updated",retry);},[]);
 useEffect(()=>{
  if(isConfirmed||!confirmationStatusUrl)return;
  let active=true,attempts=0,timer:number|undefined;
  const check=async()=>{
   try{const response=await fetch(confirmationStatusUrl,{cache:"no-store"});const payload=await response.json() as {confirmed?:unknown};if(active&&payload.confirmed===true){setIsConfirmed(true);return;}}catch{/* A later poll can observe the webhook-confirmed booking. */}
   if(active&&++attempts<20)timer=window.setTimeout(check,1_000);
  };
  void check();
  return ()=>{active=false;if(timer)window.clearTimeout(timer);};
 },[confirmationStatusUrl,isConfirmed]);
 useEffect(()=>{
  if(!isConfirmed||!destination||!Number.isSafeInteger(totalCents)||totalCents<0)return;
  if(trackGoogleAdsBookingConversion({bookingId,destination,value:totalCents/100,currency}))return;
  // Cover the brief gap between hydration, tag-loader completion, and consent.
  if(sendAttempt<20){const timer=window.setTimeout(()=>setSendAttempt(attempt=>attempt+1),250);return()=>window.clearTimeout(timer);}
 },[bookingId,currency,destination,isConfirmed,sendAttempt,totalCents]);
 return null;
}
