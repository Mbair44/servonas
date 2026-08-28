"use client";
import Script from "next/script";
import {useEffect,useState} from "react";
import {ANALYTICS_CONSENT_KEY,isPublicAnalyticsConsentPath,isServonasAnalyticsHost} from "@/lib/publicAnalytics";
export function ConsentAwareGoogleTag(){const [allowed,setAllowed]=useState(false);useEffect(()=>{const update=()=>setAllowed(localStorage.getItem(ANALYTICS_CONSENT_KEY)==="granted");update();const timer=window.setInterval(update,250);return()=>window.clearInterval(timer);},[]);if(!allowed||typeof window==="undefined"||!isServonasAnalyticsHost(location.hostname)||!isPublicAnalyticsConsentPath(location.pathname))return null;return <><Script src="https://www.googletagmanager.com/gtag/js?id=AW-18340749438" strategy="afterInteractive"/><Script id="google-ads-tag" strategy="afterInteractive">{`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'AW-18340749438');`}</Script></>}
