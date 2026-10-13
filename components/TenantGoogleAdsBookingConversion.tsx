"use client";

import {useEffect} from "react";
import {trackGoogleAdsBookingConversion} from "@/lib/googleAds";

/** Client-only because Google's gtag purchase event must share the public-site consent state. */
export function TenantGoogleAdsBookingConversion({bookingId,destination,totalCents,currency="USD"}:{bookingId:string;destination:string|null;totalCents:number;currency?:string}){
 useEffect(()=>{
  if(!destination||!Number.isSafeInteger(totalCents)||totalCents<0)return;
  trackGoogleAdsBookingConversion({bookingId,destination,value:totalCents/100,currency});
 },[bookingId,currency,destination,totalCents]);
 return null;
}
