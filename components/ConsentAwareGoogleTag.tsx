"use client";
import Script from "next/script";
import {useEffect,useState} from "react";
export function ConsentAwareGoogleTag(){const [allowed,setAllowed]=useState(false);useEffect(()=>{const update=()=>setAllowed(localStorage.getItem("servonas.analytics_consent")==="granted");update();const timer=window.setInterval(update,250);return()=>window.clearInterval(timer);},[]);if(!allowed)return null;return <><Script src="https://www.googletagmanager.com/gtag/js?id=AW-18340749438" strategy="afterInteractive"/><Script id="google-ads-tag" strategy="afterInteractive">{`window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', 'AW-18340749438');`}</Script></>}
