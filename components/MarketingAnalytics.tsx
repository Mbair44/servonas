"use client";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import {publicOptionalAnalyticsEnabled} from "@/lib/optionalAnalytics";
import {ANALYTICS_CONSENT_KEY,isPublicAnalyticsConsentPath,isServonasAnalyticsHost} from "@/lib/publicAnalytics";

const CONSENT=ANALYTICS_CONSENT_KEY,VISITOR="servonas.visitor_id",SESSION="servonas.session_id";
const EVENT_DEDUPE="servonas.marketing_event_dedupe";
const platform=()=>isServonasAnalyticsHost(location.hostname);
const consentSurface=()=>isPublicAnalyticsConsentPath(location.pathname);
const id=(key:string,storage:Storage)=>{let value=storage.getItem(key);if(!value){value=crypto.randomUUID();storage.setItem(key,value);}return value;};
const device=()=>{const ua=navigator.userAgent;return {browser:/Edg\//.test(ua)?"Edge":/Chrome\//.test(ua)?"Chrome":/Safari\//.test(ua)?"Safari":/Firefox\//.test(ua)?"Firefox":"Other",operatingSystem:/Windows/.test(ua)?"Windows":/Mac OS/.test(ua)?"macOS":/Android/.test(ua)?"Android":/iPhone|iPad/.test(ua)?"iOS":"Other",deviceType:/Mobile|Android|iPhone/.test(ua)?"mobile":/iPad|Tablet/.test(ua)?"tablet":"desktop"};};
const analyticsEnabled=publicOptionalAnalyticsEnabled();
const dedupe=(key:string,ttlMs:number)=>{try{const raw=sessionStorage.getItem(EVENT_DEDUPE),now=Date.now(),store=raw?JSON.parse(raw) as Record<string,number>:{};for(const [entry,expiresAt] of Object.entries(store))if(expiresAt<=now)delete store[entry];if((store[key]??0)>now){sessionStorage.setItem(EVENT_DEDUPE,JSON.stringify(store));return true;}store[key]=now+ttlMs;sessionStorage.setItem(EVENT_DEDUPE,JSON.stringify(store));}catch{/* ignore storage issues */}return false;};

type MarketingEventType="page_view"|"click"|"signup_completed"|"lead_capture_popup_viewed"|"lead_capture_popup_dismissed"|"lead_capture_popup_submitted"|"lead_capture_popup_converted";

const stored=(params:URLSearchParams,key:string)=>params.get(key)||localStorage.getItem(`servonas.${key}`)||"";

export function trackMarketingEvent(eventType:MarketingEventType,options:{label?:string;elementType?:string;href?:string;path?:string;ttlMs?:number}={}){
 if(typeof window==="undefined"||!analyticsEnabled||!platform())return;
 if(localStorage.getItem(CONSENT)!=="granted")return;
 const visitorId=id(VISITOR,localStorage),sessionId=id(SESSION,sessionStorage),search=location.search.slice(1),params=new URLSearchParams(search);
 const label=(options.label||"").trim();
 const elementType=options.elementType||"";
 const href=options.href||"";
 const path=options.path||`${location.pathname}${search?`?${search}`:""}`;
 const dedupeKey=[eventType,path,label.slice(0,120),elementType,href].join("|");
 const ttlMs=options.ttlMs??(eventType==="page_view"?180000:10000);
 if(dedupe(dedupeKey,ttlMs))return;
 void fetch("/api/marketing/events",{method:"POST",headers:{"content-type":"application/json"},keepalive:true,body:JSON.stringify({visitorId,sessionId,eventType,path,referrer:document.referrer,label,elementType,href,utmSource:stored(params,"utm_source"),utmMedium:stored(params,"utm_medium"),utmCampaign:stored(params,"utm_campaign"),utmContent:stored(params,"utm_content"),utmTerm:stored(params,"utm_term"),gclid:stored(params,"gclid"),gbraid:stored(params,"gbraid"),wbraid:stored(params,"wbraid"),...device()})}).catch(()=>undefined);
}

export function MarketingAnalytics(){
 const [consent,setConsent]=useState<string|null>(null),pathname=usePathname();
 useEffect(()=>{if(analyticsEnabled&&consentSurface())setConsent(localStorage.getItem(CONSENT));},[]);
 useEffect(()=>{
  if(!analyticsEnabled||consent!=="granted"||!platform())return;
  const search=location.search.slice(1),params=new URLSearchParams(search);
  for(const key of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","gbraid","wbraid"]){const value=params.get(key);if(value)localStorage.setItem(`servonas.${key}`,value);}
  trackMarketingEvent("page_view",{path:`${pathname}${search?`?${search}`:""}`});
  const content=params.get("utm_content");if(content&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(content))void fetch("/api/marketing/content-lead",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content}),keepalive:true});
  const click=(event:MouseEvent)=>{const element=(event.target as Element)?.closest("a,button") as HTMLElement|null;if(element)trackMarketingEvent("click",{label:(element.innerText||element.getAttribute("aria-label")||"").trim(),elementType:element.tagName.toLowerCase(),href:element instanceof HTMLAnchorElement?element.href:"",path:`${pathname}${search?`?${search}`:""}`});};
  document.addEventListener("click",click,true);return()=>document.removeEventListener("click",click,true);
 },[consent,pathname]);
 if(!analyticsEnabled||typeof window==="undefined"||!consentSurface()||consent)return null;
 const choose=(value:"granted"|"denied")=>{localStorage.setItem(CONSENT,value);setConsent(value);};
 return <aside className="analytics-consent" role="dialog" aria-label="Analytics preferences"><div><strong>Your privacy choices</strong><p>Optional first-party analytics help Servonas understand campaign traffic. We never store raw IP addresses or use invasive fingerprinting. <a href="/privacy">Privacy details</a></p></div><div><button className="sv-button sv-secondary" onClick={()=>choose("denied")}>Only necessary</button><button className="sv-button" onClick={()=>choose("granted")}>Allow analytics</button></div></aside>;
}
