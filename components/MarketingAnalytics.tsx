"use client";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";
import {publicOptionalAnalyticsEnabled} from "@/lib/optionalAnalytics";

const CONSENT="servonas.analytics_consent",VISITOR="servonas.visitor_id",SESSION="servonas.session_id";
const platform=()=>location.hostname==="servonas.com"||location.hostname==="www.servonas.com"||location.hostname==="localhost"||location.hostname.endsWith(".vercel.app");
const id=(key:string,storage:Storage)=>{let value=storage.getItem(key);if(!value){value=crypto.randomUUID();storage.setItem(key,value);}return value;};
const device=()=>{const ua=navigator.userAgent;return {browser:/Edg\//.test(ua)?"Edge":/Chrome\//.test(ua)?"Chrome":/Safari\//.test(ua)?"Safari":/Firefox\//.test(ua)?"Firefox":"Other",operatingSystem:/Windows/.test(ua)?"Windows":/Mac OS/.test(ua)?"macOS":/Android/.test(ua)?"Android":/iPhone|iPad/.test(ua)?"iOS":"Other",deviceType:/Mobile|Android|iPhone/.test(ua)?"mobile":/iPad|Tablet/.test(ua)?"tablet":"desktop"};};
const analyticsEnabled=publicOptionalAnalyticsEnabled();

export function MarketingAnalytics(){
 const [consent,setConsent]=useState<string|null>(null),pathname=usePathname();
 useEffect(()=>{if(analyticsEnabled&&platform())setConsent(localStorage.getItem(CONSENT));},[]);
 useEffect(()=>{
  if(!analyticsEnabled||consent!=="granted"||!platform())return;
  const visitorId=id(VISITOR,localStorage),sessionId=id(SESSION,sessionStorage),search=location.search.slice(1),params=new URLSearchParams(search);
  for(const key of ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","gbraid","wbraid"]){const value=params.get(key);if(value)localStorage.setItem(`servonas.${key}`,value);}
  const stored=(key:string)=>params.get(key)||localStorage.getItem(`servonas.${key}`)||"";
  const send=(eventType:string,label="",elementType="",href="")=>{void fetch("/api/marketing/events",{method:"POST",headers:{"content-type":"application/json"},keepalive:true,body:JSON.stringify({visitorId,sessionId,eventType,path:`${pathname}${search?`?${search}`:""}`,referrer:document.referrer,label,elementType,href,utmSource:stored("utm_source"),utmMedium:stored("utm_medium"),utmCampaign:stored("utm_campaign"),utmContent:stored("utm_content"),utmTerm:stored("utm_term"),gclid:stored("gclid"),gbraid:stored("gbraid"),wbraid:stored("wbraid"),...device()})});};
  send("page_view");
  const content=params.get("utm_content");if(content&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(content))void fetch("/api/marketing/content-lead",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content}),keepalive:true});
  const click=(event:MouseEvent)=>{const element=(event.target as Element)?.closest("a,button") as HTMLElement|null;if(element)send("click",(element.innerText||element.getAttribute("aria-label")||"").trim(),element.tagName.toLowerCase(),element instanceof HTMLAnchorElement?element.href:"");};
  document.addEventListener("click",click,true);return()=>document.removeEventListener("click",click,true);
 },[consent,pathname]);
 if(!analyticsEnabled||typeof window==="undefined"||!platform()||consent)return null;
 const choose=(value:"granted"|"denied")=>{localStorage.setItem(CONSENT,value);setConsent(value);};
 return <aside className="analytics-consent" role="dialog" aria-label="Analytics preferences"><div><strong>Your privacy choices</strong><p>Optional first-party analytics help Servonas understand campaign traffic. We never store raw IP addresses or use invasive fingerprinting. <a href="/privacy">Privacy details</a></p></div><div><button className="sv-button sv-secondary" onClick={()=>choose("denied")}>Only necessary</button><button className="sv-button" onClick={()=>choose("granted")}>Allow analytics</button></div></aside>;
}
