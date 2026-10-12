import {ANALYTICS_CONSENT_KEY,isPublicAnalyticsConsentPath,isServonasAnalyticsHost} from "./publicAnalytics.ts";

export type GoogleTag = (...args: unknown[]) => void;
type TagContext={tagId:string;scope:string;pathname:string};
type GoogleWindow=Window & {
 gtag?:GoogleTag;
 dataLayer?:unknown[];
 __servonasGoogleContext?:TagContext;
 __servonasGoogleConfigured?:Set<string>;
 __servonasGooglePage?:string;
};

export function normalizeGoogleAdsTagId(value:unknown):string|null{
 if(typeof value!=="string")return null;
 const id=value.trim();
 return /^AW-[0-9]{6,20}$/.test(id)?id:null;
}

export function googleAdsConsentGranted(){
 try{return typeof window!=="undefined"&&window.localStorage.getItem(ANALYTICS_CONSENT_KEY)==="granted";}
 catch{return false;}
}

export function isPlatformGoogleAdsPath(path:string){
 return isPublicAnalyticsConsentPath(path)&&!/^\/(?:sites|book|booking|success|manage-booking|invoice|estimate)(?:\/|$)/.test(path);
}

export function activeGoogleAdsContext(){
 if(typeof window==="undefined"||!googleAdsConsentGranted()||!isPublicAnalyticsConsentPath(window.location.pathname))return null;
 const context=(window as GoogleWindow).__servonasGoogleContext;
 return context?.pathname===window.location.pathname?context:null;
}

/** One loader for all Google destinations; no network or queue writes before consent. */
export function activateGoogleAdsTag(rawId:unknown,scope:string):(()=>void)|null{
 const tagId=normalizeGoogleAdsTagId(rawId);
 if(!tagId||!scope||typeof window==="undefined"||!googleAdsConsentGranted()||!isPublicAnalyticsConsentPath(window.location.pathname))return null;
 if(scope==="platform"&&(!isServonasAnalyticsHost(window.location.hostname)||!isPlatformGoogleAdsPath(window.location.pathname)))return null;
 const browser=window as GoogleWindow;
 const context={tagId,scope,pathname:window.location.pathname};
 const hadGtag=typeof browser.gtag==="function";
 const existingLoader=Array.from(document.scripts).some(script=>{
  try{const url=new URL(script.src);return url.hostname==="www.googletagmanager.com"&&url.pathname==="/gtag/js";}catch{return false;}
 });
 browser.dataLayer??=[];
 if(!hadGtag){
  browser.gtag=function(){
   // Google's queue expects the Arguments object used by the standard snippet.
   // eslint-disable-next-line prefer-rest-params
   browser.dataLayer!.push(arguments);
  };
  browser.gtag("js",new Date());
 }
 if(!hadGtag&&!existingLoader){
  const script=document.createElement("script");
  script.async=true;
  script.src=`https://www.googletagmanager.com/gtag/js?id=${tagId}`;
  document.head.appendChild(script);
 }
 const configured=browser.__servonasGoogleConfigured??=new Set();
 const configKey=`${scope}:${tagId}`;
 if(!configured.has(configKey)){
  // Explicit destinations keep events out of previously visited tenants' tags.
  browser.gtag!("config",tagId,{send_page_view:false,groups:`servonas_${configKey.replace(/[^a-zA-Z0-9_]/g,"_")}`});
  configured.add(configKey);
 }
 browser.__servonasGoogleContext=context;
 const pageKey=`${configKey}:${window.location.href}`;
 if(browser.__servonasGooglePage!==pageKey){
  browser.gtag!("event","page_view",{send_to:tagId});
  browser.__servonasGooglePage=pageKey;
 }
 return ()=>{
  if(browser.__servonasGoogleContext===context)delete browser.__servonasGoogleContext;
 };
}
