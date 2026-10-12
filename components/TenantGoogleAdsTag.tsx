"use client";
import {useEffect} from "react";
import {usePathname} from "next/navigation";
import {activateGoogleAdsTag,updateGoogleAdsConsent} from "@/lib/googleTag";

export function TenantGoogleAdsTag({tagId,scope}:{tagId:string|null;scope:string}){
 const pathname=usePathname();
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
 return null;
}
