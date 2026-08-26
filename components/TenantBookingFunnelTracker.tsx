"use client";

import {useEffect,useRef} from "react";
import {attributionFromSearch,type AttributionValues,type BookingFunnelEvent} from "@/lib/bookingFunnel";
import {publicOptionalAnalyticsEnabled} from "@/lib/optionalAnalytics";

const key=(slug:string)=>`servonas.booking-attribution.${slug}`;
const dedupeKey=(slug:string)=>`servonas.booking-funnel-dedupe.${slug}`;
const debugKey="servonas.booking-funnel-debug";
const analyticsEnabled=publicOptionalAnalyticsEnabled();
const sessionTouchIntervalMs=15*60*1000;
const eventTtlMs:Partial<Record<BookingFunnelEvent,number>>={
 landing_page_view:60_000,
 inventory_item_view:60_000,
 inventory_item_clicked:60_000,
 availability_check_started:15_000,
 check_availability_clicked:15_000,
 event_date_selected:5_000,
 event_date_changed:5_000,
 rental_availability_checked:5_000,
 rental_available:5_000,
 rental_unavailable:5_000,
 available_inventory_viewed:5_000,
 booking_started:15_000,
 customer_info_entered:10_000,
 checkout_started:15_000,
 reserve_clicked:5_000,
 item_added_to_cart:5_000,
};
const criticalEvents=new Set<BookingFunnelEvent>(["booking_started","customer_info_entered","checkout_started","reserve_clicked","item_added_to_cart"]);
type Stored={sessionId:string;attribution:AttributionValues;landingUrl:string;referrer:string;lastSessionSyncAt?:number};
const stored=(slug:string):Stored=>{
 const existing=localStorage.getItem(key(slug));if(existing){try{const value=JSON.parse(existing) as Stored;if(value.sessionId)return value;}catch{/* replace malformed storage */}}
 const value={sessionId:crypto.randomUUID(),attribution:attributionFromSearch(new URLSearchParams(location.search)),landingUrl:location.href,referrer:document.referrer,lastSessionSyncAt:0};localStorage.setItem(key(slug),JSON.stringify(value));return value;
};
const eventFingerprint=(event:BookingFunnelEvent,options:{inventoryItemId?:string;metadata?:Record<string,unknown>})=>JSON.stringify([event,options.inventoryItemId??null,options.metadata??{}]);
const shouldSkipEvent=(slug:string,event:BookingFunnelEvent,options:{inventoryItemId?:string;metadata?:Record<string,unknown>})=>{
 const ttl=eventTtlMs[event];
 if(!ttl||typeof window==="undefined")return false;
 const fingerprint=eventFingerprint(event,options);
 try{
  const raw=window.sessionStorage.getItem(dedupeKey(slug));
  const current=raw?JSON.parse(raw) as Record<string,number>:{};
  const now=Date.now();
  const previous=current[fingerprint];
  current[fingerprint]=now;
  for(const [key,value] of Object.entries(current))if(!Number.isFinite(value)||now-value>Math.max(ttl,sessionTouchIntervalMs))delete current[key];
  window.sessionStorage.setItem(dedupeKey(slug),JSON.stringify(current));
  return Number.isFinite(previous)&&now-previous<ttl;
 }catch{
  return false;
 }
};
const debugEnabled=()=>{
 if(typeof window==="undefined")return false;
 try{
  const params=new URLSearchParams(window.location.search);
  if(params.get("sv_debug_funnel")==="1")return true;
  return window.localStorage.getItem(debugKey)==="1";
 }catch{
  return false;
 }
};
const logDebug=(slug:string,event:BookingFunnelEvent,message:string,details:Record<string,unknown>={})=>{
 if(!debugEnabled())return;
 console.info("[Servonas booking funnel]",{slug,event,message,...details});
};
const payloadFor=(slug:string,event:BookingFunnelEvent,options:{inventoryItemId?:string;metadata?:Record<string,unknown>},touchSession:boolean)=>{
 const state=stored(slug);
 return {
  sessionId:state.sessionId,
  event,
  path:`${location.pathname}${location.search}`,
  landingUrl:state.landingUrl,
  referrer:state.referrer,
  attribution:state.attribution,
  inventoryItemId:options.inventoryItemId,
  metadata:options.metadata??{},
  touchSession,
 };
};
const postWithBeacon=(slug:string,event:BookingFunnelEvent,payload:ReturnType<typeof payloadFor>)=>{
 if(typeof window==="undefined"||typeof navigator.sendBeacon!=="function")return false;
 try{
  const body=new Blob([JSON.stringify(payload)],{type:"application/json"});
  const sent=navigator.sendBeacon(`/api/public-booking/${encodeURIComponent(slug)}/funnel`,body);
  logDebug(slug,event,sent?"beacon_sent":"beacon_rejected",{transport:"beacon"});
  return sent;
 }catch{
  logDebug(slug,event,"beacon_failed",{transport:"beacon"});
  return false;
 }
};

export function bookingAttributionSession(slug:string){if(typeof window==="undefined")return "";return stored(slug).sessionId;}
export function trackBookingFunnel(slug:string,event:BookingFunnelEvent,options:{inventoryItemId?:string;metadata?:Record<string,unknown>}={}){
 if(!analyticsEnabled||typeof window==="undefined"){logDebug(slug,event,"skipped",{reason:"analytics_disabled_or_server"});return;}
 if(shouldSkipEvent(slug,event,options)){logDebug(slug,event,"skipped",{reason:"deduped"});return;}
 const state=stored(slug),now=Date.now(),touchSession=event==="landing_page_view"||!state.lastSessionSyncAt||now-state.lastSessionSyncAt>=sessionTouchIntervalMs;
 if(touchSession)localStorage.setItem(key(slug),JSON.stringify({...state,lastSessionSyncAt:now}));
 const payload=payloadFor(slug,event,options,touchSession);
 if(criticalEvents.has(event)&&postWithBeacon(slug,event,payload))return;
 void fetch(`/api/public-booking/${encodeURIComponent(slug)}/funnel`,{method:"POST",headers:{"content-type":"application/json"},keepalive:true,cache:"no-store",credentials:"same-origin",body:JSON.stringify(payload)}).then(response=>{logDebug(slug,event,"fetch_complete",{status:response.status,transport:"fetch"});}).catch(error=>{logDebug(slug,event,"fetch_failed",{transport:"fetch",error:error instanceof Error?error.message:"request_failed"});});
}

export function TenantBookingFunnelTracker({businessSlug,initialSessionId}:{businessSlug:string;initialSessionId?:string}){
 const sent=useRef(false);
 useEffect(()=>{if(!analyticsEnabled)return;if(initialSessionId&&/^[0-9a-f-]{36}$/i.test(initialSessionId)){const current=stored(businessSlug);localStorage.setItem(key(businessSlug),JSON.stringify({...current,sessionId:initialSessionId}));}if(sent.current)return;sent.current=true;trackBookingFunnel(businessSlug,"landing_page_view");
  const rewrite=(root:ParentNode=document)=>root.querySelectorAll<HTMLAnchorElement|HTMLIFrameElement>(`a[href*="/book/${businessSlug}"],iframe[src*="/book/${businessSlug}"]`).forEach(element=>{const attribute=element instanceof HTMLAnchorElement?"href":"src",raw=element.getAttribute(attribute);if(!raw)return;try{const url=new URL(raw,location.href);if(url.searchParams.has("sv_at"))return;url.searchParams.set("sv_at",bookingAttributionSession(businessSlug));element.setAttribute(attribute,url.toString());}catch{/* external link remains usable */}});
  rewrite();const observer=new MutationObserver(()=>rewrite());observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect();
 },[businessSlug,initialSessionId]);
 if(!analyticsEnabled)return null;
 return null;
}
