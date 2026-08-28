"use client";

import {useEffect,useState} from "react";
import {usePathname,useSearchParams} from "next/navigation";
import {ANALYTICS_CONSENT_KEY} from "@/lib/publicAnalytics";

const CONSENT_KEY=ANALYTICS_CONSENT_KEY;
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
const ensureMetaPixelStub=()=>{
 if(typeof window==="undefined")return null;
 if(typeof window.fbq==="function")return window.fbq;
 const fbq=function(...args:any[]){
  if(typeof fbq.callMethod==="function")fbq.callMethod(...args);
  else fbq.queue?.push(args);
 } as NonNullable<Window["fbq"]>;
 fbq.queue=[];
 fbq.loaded=true;
 fbq.version="2.0";
 fbq.push=(...args:any[])=>fbq.queue?.push(args)??0;
 window.fbq=fbq;
 if(!window._fbq)window._fbq=fbq;
 return fbq;
};
const ensureMetaPixelScript=()=>{
 if(typeof document==="undefined")return;
 if(document.querySelector(`script[data-servonas-meta-pixel="${META_PIXEL_SRC}"]`))return;
 const script=document.createElement("script");
 script.async=true;
 script.src=META_PIXEL_SRC;
 script.setAttribute("data-servonas-meta-pixel",META_PIXEL_SRC);
 document.head.appendChild(script);
};

export function TenantMetaPixel({pixelId}:{pixelId:string}){
 const pathname=usePathname();
 const searchParams=useSearchParams();
 const [allowed,setAllowed]=useState(false);
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
  ensureMetaPixelScript();
  const fbq=ensureMetaPixelStub();
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

 return <noscript><img height="1" width="1" style={{display:"none"}} alt="" src={`https://www.facebook.com/tr?id=${normalizedPixelId}&ev=PageView&noscript=1`}/></noscript>;
}
