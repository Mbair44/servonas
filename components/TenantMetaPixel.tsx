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
  __servonasMetaPixelEventKeys?:string[];
 }
}

const validPixelId=(value:string)=>PIXEL_ID_PATTERN.test(value.trim())?value.trim():null;
const metaEventLimit=100;
const pathBlocked=(pathname:string)=>pathname.startsWith("/app")||pathname.startsWith("/tech")||pathname.startsWith("/sites/preview");
const sanitizeMetaParams=(value:Record<string,unknown>)=>Object.fromEntries(Object.entries(value).filter(([,entry])=>entry!=null&&(!Array.isArray(entry)||entry.length>0)));
const consentGranted=()=>typeof window!=="undefined"&&window.localStorage.getItem(CONSENT_KEY)==="granted";
const activeMetaPixelId=()=>typeof window==="undefined"?null:validPixelId(window.__servonasMetaPixelId??"");
const rememberMetaEvent=(eventKey:string,storage:"memory"|"session"|"local"="memory")=>{
 if(typeof window==="undefined"||!eventKey)return false;
 const tracked=window.__servonasMetaPixelEventKeys??[];
 if(tracked.includes(eventKey))return true;
 window.__servonasMetaPixelEventKeys=[...tracked,eventKey].slice(-metaEventLimit);
 if(storage==="memory")return false;
 try{
  const bucket=storage==="local"?window.localStorage:window.sessionStorage;
  const raw=bucket.getItem("servonas.meta-pixel-events");
  const keys=raw?JSON.parse(raw) as string[]:[];
  if(keys.includes(eventKey))return true;
  bucket.setItem("servonas.meta-pixel-events",JSON.stringify([...keys,eventKey].slice(-metaEventLimit)));
 }catch{}
 return false;
};
export function trackMetaStandardEvent(event:"ViewContent"|"InitiateCheckout"|"Purchase",params:Record<string,unknown>,options:{eventKey?:string;storage?:"memory"|"session"|"local"}={}){
 if(typeof window==="undefined"||typeof window.fbq!=="function"||!consentGranted()||!activeMetaPixelId()||pathBlocked(window.location.pathname))return;
 if(options.eventKey&&rememberMetaEvent(options.eventKey,options.storage))return;
 window.fbq("track",event,sanitizeMetaParams(params));
}
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
   window.__servonasMetaPixelEventKeys=[];
  }
  if(tracked.includes(pageKey))return;
  fbq("track","PageView");
  window.__servonasMetaPixelPageViews=[...tracked,pageKey].slice(-25);
 },[allowed,normalizedPixelId,pageKey]);

 if(!allowed||!normalizedPixelId)return null;

 return <noscript><img height="1" width="1" style={{display:"none"}} alt="" src={`https://www.facebook.com/tr?id=${normalizedPixelId}&ev=PageView&noscript=1`}/></noscript>;
}
