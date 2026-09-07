"use client";

import {useEffect,useState} from "react";
import {usePathname,useSearchParams} from "next/navigation";
import {ANALYTICS_CONSENT_KEY} from "@/lib/publicAnalytics";
import {createMetaEventId,type MetaStandardEvent} from "@/lib/metaEventId";

export {createMetaEventId} from "@/lib/metaEventId";

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
  __servonasMetaServerEventKeys?:string[];
 }
}

const validPixelId=(value:string)=>PIXEL_ID_PATTERN.test(value.trim())?value.trim():null;
const metaEventLimit=100;
const pathBlocked=(pathname:string)=>pathname.startsWith("/app")||pathname.startsWith("/tech")||pathname.startsWith("/sites/preview");
const sanitizeMetaParams=(value:Record<string,unknown>)=>Object.fromEntries(Object.entries(value).filter(([,entry])=>entry!=null&&(!Array.isArray(entry)||entry.length>0)));
const consentGranted=()=>typeof window!=="undefined"&&window.localStorage.getItem(CONSENT_KEY)==="granted";
const activeMetaPixelId=()=>typeof window==="undefined"?null:validPixelId(window.__servonasMetaPixelId??"");
const metaDebugEnabled=()=>process.env.NODE_ENV!=="production"||typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("sv_debug_meta")==="1";
const logMetaDebug=(event:string,eventId:string,source:"browser"|"server",suppressed:boolean,details:Record<string,unknown>={})=>{if(metaDebugEnabled())console.info("[Servonas Meta event]",{event,event_id:eventId,source,suppressed,...details});};
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
export function trackMetaStandardEvent(event:MetaStandardEvent,params:Record<string,unknown>,options:{eventId?:string;eventKey?:string;storage?:"memory"|"session"|"local"}={}){
 const eventId=options.eventId;
 if(typeof window==="undefined"||typeof window.fbq!=="function"||!consentGranted()||!activeMetaPixelId()||pathBlocked(window.location.pathname))return false;
 const dedupeValue=eventId??options.eventKey;
 if(dedupeValue&&rememberMetaEvent(dedupeValue,options.storage)){if(eventId)logMetaDebug(event,eventId,"browser",true);return false;}
 if(eventId)window.fbq("track",event,sanitizeMetaParams(params),{eventID:eventId});
 else window.fbq("track",event,sanitizeMetaParams(params));
 if(eventId)logMetaDebug(event,eventId,"browser",false);
 return true;
}
const metaCookie=(name:string)=>{if(typeof document==="undefined")return null;const prefix=`${name}=`;const entry=document.cookie.split(";").map(value=>value.trim()).find(value=>value.startsWith(prefix));return entry?decodeURIComponent(entry.slice(prefix.length)):null;};
export function trackMetaServerEvent(businessSlug:string,event:"InitiateCheckout",params:Record<string,unknown>,eventId:string,eventSourceUrl?:string){
 if(typeof window==="undefined"||!consentGranted()||!activeMetaPixelId()||pathBlocked(window.location.pathname))return eventId;
 const serverKeys=window.__servonasMetaServerEventKeys??[];
 if(serverKeys.includes(eventId)){logMetaDebug(event,eventId,"server",true,{reason:"client_delivery_suppressed"});return eventId;}
 window.__servonasMetaServerEventKeys=[...serverKeys,eventId].slice(-metaEventLimit);
 const payload=JSON.stringify({event,eventId,eventSourceUrl:eventSourceUrl??window.location.href,customData:sanitizeMetaParams(params),fbp:metaCookie("_fbp"),fbc:metaCookie("_fbc")});
 const endpoint=`/api/public-booking/${encodeURIComponent(businessSlug)}/meta-event`;
 let beaconSent=false;
 try{if(typeof navigator.sendBeacon==="function")beaconSent=navigator.sendBeacon(endpoint,new Blob([payload],{type:"application/json"}));}catch{}
 if(beaconSent){logMetaDebug(event,eventId,"server",false,{delivery:"beacon"});return eventId;}
 void fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:payload,keepalive:true,credentials:"same-origin"}).then(response=>logMetaDebug(event,eventId,"server",false,{delivery:"fetch",status:response.status})).catch(error=>logMetaDebug(event,eventId,"server",false,{delivery:"fetch",error:error instanceof Error?error.message:"request_failed"}));
 return eventId;
}
export function trackMetaBrowserAndServerEvent(businessSlug:string,event:"InitiateCheckout",params:Record<string,unknown>,eventId=createMetaEventId(event)){
 const browserSent=trackMetaStandardEvent(event,params,{eventId,storage:"session"});
 if(browserSent)trackMetaServerEvent(businessSlug,event,params,eventId);
 return eventId;
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
   window.__servonasMetaServerEventKeys=[];
  }
  if(tracked.includes(pageKey))return;
  fbq("track","PageView");
  window.__servonasMetaPixelPageViews=[...tracked,pageKey].slice(-25);
 },[allowed,normalizedPixelId,pageKey]);

 if(!allowed||!normalizedPixelId)return null;

 return <noscript><img height="1" width="1" style={{display:"none"}} alt="" src={`https://www.facebook.com/tr?id=${normalizedPixelId}&ev=PageView&noscript=1`}/></noscript>;
}
