"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
import {activateGoogleAdsTag,normalizeGoogleAdsTagId,updateGoogleAdsConsent} from "@/lib/googleTag";

export function TenantGoogleAdsTag({tagId,scope}:{tagId:string|null;scope:string}){
 const pathname=usePathname();
 const normalizedTagId=normalizeGoogleAdsTagId(tagId);
 useEffect(()=>{
  let release:(()=>void)|null=null;
  const update=()=>{
   if(!release)release=activateGoogleAdsTag(tagId,scope);
   if(release)updateGoogleAdsConsent();
  };
  update();
  window.addEventListener("storage",update);
  const timer=window.setInterval(update,250);
  return ()=>{release?.();window.removeEventListener("storage",update);window.clearInterval(timer);};
 },[tagId,scope,pathname]);
 if(!normalizedTagId)return null;
 // Keep the base tag discoverable in the initial document. Consent Mode remains
 // denied until the existing Servonas analytics choice is granted in the effect.
 const configKey=`${scope}:${normalizedTagId}`;
 const group=`servonas_${configKey.replace(/[^a-zA-Z0-9_]/g,"_")}`;
 const bootstrap=`window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};window.gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});window.gtag('config',${JSON.stringify(normalizedTagId)},{send_page_view:false,groups:${JSON.stringify(group)}});window.__servonasGoogleConfigured=window.__servonasGoogleConfigured||new Set();window.__servonasGoogleConfigured.add(${JSON.stringify(configKey)});window.__servonasGoogleConsent=false;`;
 return <><script id={`servonas-google-consent-${normalizedTagId}`} dangerouslySetInnerHTML={{__html:bootstrap}}/><script id={`servonas-google-loader-${normalizedTagId}`} async src={`https://www.googletagmanager.com/gtag/js?id=${normalizedTagId}`}/></>;
}
