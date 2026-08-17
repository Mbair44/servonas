"use client";

import {useEffect,useRef} from "react";
import {attributionFromSearch,type AttributionValues,type BookingFunnelEvent} from "@/lib/bookingFunnel";

const key=(slug:string)=>`servonas.booking-attribution.${slug}`;
type Stored={sessionId:string;attribution:AttributionValues;landingUrl:string;referrer:string};
const stored=(slug:string):Stored=>{
 const existing=localStorage.getItem(key(slug));if(existing){try{const value=JSON.parse(existing) as Stored;if(value.sessionId)return value;}catch{/* replace malformed storage */}}
 const value={sessionId:crypto.randomUUID(),attribution:attributionFromSearch(new URLSearchParams(location.search)),landingUrl:location.href,referrer:document.referrer};localStorage.setItem(key(slug),JSON.stringify(value));return value;
};

export function bookingAttributionSession(slug:string){if(typeof window==="undefined")return "";return stored(slug).sessionId;}
export function trackBookingFunnel(slug:string,event:BookingFunnelEvent,options:{inventoryItemId?:string;metadata?:Record<string,unknown>}={}){
 if(typeof window==="undefined")return;const state=stored(slug);void fetch(`/api/public-booking/${encodeURIComponent(slug)}/funnel`,{method:"POST",headers:{"content-type":"application/json"},keepalive:true,body:JSON.stringify({sessionId:state.sessionId,event,path:`${location.pathname}${location.search}`,landingUrl:state.landingUrl,referrer:state.referrer,attribution:state.attribution,inventoryItemId:options.inventoryItemId,metadata:options.metadata??{}})}).catch(()=>undefined);
}

export function TenantBookingFunnelTracker({businessSlug,initialSessionId}:{businessSlug:string;initialSessionId?:string}){
 const sent=useRef(false);
 useEffect(()=>{if(initialSessionId&&/^[0-9a-f-]{36}$/i.test(initialSessionId)){const current=stored(businessSlug);localStorage.setItem(key(businessSlug),JSON.stringify({...current,sessionId:initialSessionId}));}if(sent.current)return;sent.current=true;trackBookingFunnel(businessSlug,"landing_page_view");
  const rewrite=(root:ParentNode=document)=>root.querySelectorAll<HTMLAnchorElement|HTMLIFrameElement>(`a[href*="/book/${businessSlug}"],iframe[src*="/book/${businessSlug}"]`).forEach(element=>{const attribute=element instanceof HTMLAnchorElement?"href":"src",raw=element.getAttribute(attribute);if(!raw)return;try{const url=new URL(raw,location.href);if(url.searchParams.has("sv_at"))return;url.searchParams.set("sv_at",bookingAttributionSession(businessSlug));element.setAttribute(attribute,url.toString());}catch{/* external link remains usable */}});
  rewrite();const observer=new MutationObserver(()=>rewrite());observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect();
 },[businessSlug,initialSessionId]);
 return null;
}
