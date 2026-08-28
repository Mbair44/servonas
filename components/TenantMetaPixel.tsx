"use client";

import Script from "next/script";
import {useEffect,useId,useState} from "react";
import {usePathname,useSearchParams} from "next/navigation";

const CONSENT_KEY="servonas.analytics_consent";
const PIXEL_ID_PATTERN=/^[0-9]{8,24}$/;
const META_PIXEL_SRC="https://connect.facebook.net/en_US/fbevents.js";

declare global{
 interface Window{
  fbq?:((...args:any[])=>void)&{callMethod?:(...args:any[])=>void;queue?:unknown[];loaded?:boolean;version?:string;push?:(...args:any[])=>number};
  _fbq?:Window["fbq"];
  __servonasMetaPixelId?:string;
  __servonasMetaPixelPageViews?:string[];
 }
}

const validPixelId=(value:string)=>PIXEL_ID_PATTERN.test(value.trim())?value.trim():null;

export function TenantMetaPixel({pixelId}:{pixelId:string}){
 const pathname=usePathname();
 const searchParams=useSearchParams();
 const [allowed,setAllowed]=useState(false);
 const scriptId=useId();
 const normalizedPixelId=validPixelId(pixelId);
 const pageKey=`${pathname}${searchParams?.toString()?`?${searchParams.toString()}`:""}`;

 useEffect(()=>{
  const update=()=>setAllowed(localStorage.getItem(CONSENT_KEY)==="granted");
  update();
  window.addEventListener("storage",update);
  const timer=window.setInterval(update,250);
  return ()=>{window.removeEventListener("storage",update);window.clearInterval(timer);};
 },[]);

 useEffect(()=>{
  if(!allowed||!normalizedPixelId||typeof window==="undefined")return;
  const fbq=window.fbq;
  if(typeof fbq!=="function")return;
  const tracked=window.__servonasMetaPixelPageViews??=[];
  if(window.__servonasMetaPixelId!==normalizedPixelId){
   fbq("init",normalizedPixelId);
   window.__servonasMetaPixelId=normalizedPixelId;
   window.__servonasMetaPixelPageViews=[];
  }
  if(tracked.includes(pageKey))return;
  fbq("track","PageView");
  window.__servonasMetaPixelPageViews=[...tracked,pageKey].slice(-25);
 },[allowed,normalizedPixelId,pageKey]);

 if(!allowed||!normalizedPixelId)return null;

 return <>
  <Script src={META_PIXEL_SRC} strategy="afterInteractive"/>
  <Script id={`tenant-meta-pixel-${scriptId}`} strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','${META_PIXEL_SRC}');`}</Script>
  <noscript><img height="1" width="1" style={{display:"none"}} alt="" src={`https://www.facebook.com/tr?id=${normalizedPixelId}&ev=PageView&noscript=1`}/></noscript>
 </>;
}
