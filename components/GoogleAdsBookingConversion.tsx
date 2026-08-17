"use client";
import {useEffect} from "react";
import {trackGoogleAdsBookingConversion} from "@/lib/googleAds";
export function GoogleAdsBookingConversion({bookingId,valueCents,currency="USD"}:{bookingId:string;valueCents:number;currency?:string}){useEffect(()=>{trackGoogleAdsBookingConversion(bookingId,valueCents/100,currency);},[bookingId,valueCents,currency]);return null;}
