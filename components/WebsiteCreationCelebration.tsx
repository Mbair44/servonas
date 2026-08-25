"use client";

import {useEffect,useMemo,useState} from "react";
import {trackAcquisition} from "./AcquisitionFunnelTracker";
import type {WebsiteFirstSource} from "@/lib/websiteFirstConfig";

type CelebrationVariant="confetti"|"car_detailing_reveal";

function variantForIndustry(source:WebsiteFirstSource):CelebrationVariant{
 return source==="car-detailing-website"?"car_detailing_reveal":"confetti";
}

function useReducedMotion(){
 const [reduced,setReduced]=useState(false);
 useEffect(()=>{
  if(typeof window==="undefined"||typeof window.matchMedia!=="function")return;
  const media=window.matchMedia("(prefers-reduced-motion: reduce)");
  const update=()=>setReduced(media.matches);
  update();
  media.addEventListener("change",update);
  return ()=>media.removeEventListener("change",update);
 },[]);
 return reduced;
}

export function WebsiteCreationCelebration({source,businessId,businessSlug,celebrationKey,fullscreen=false}:{source:WebsiteFirstSource;businessId:string;businessSlug:string;celebrationKey?:string;fullscreen?:boolean}){
 const reducedMotion=useReducedMotion();
 const variant=variantForIndustry(source);
 const [active,setActive]=useState(false);
 const particles=useMemo(()=>Array.from({length:18},(_,index)=>({id:index,left:`${6+index*5}%`,delay:`${(index%6)*0.07}s`,duration:`${1.1+(index%4)*0.18}s`,rotate:`${(index%5-2)*18}deg`})),[]);
 useEffect(()=>{
  if(!celebrationKey||typeof window==="undefined")return;
  const storageKey=`servonas.website-celebration:${celebrationKey}`;
  if(sessionStorage.getItem(storageKey))return;
  sessionStorage.setItem(storageKey,"shown");
  trackAcquisition(source,"website_creation_celebration_shown",{industry:source,celebration_variant:variant,business_id:businessId,business_slug:businessSlug,timestamp:new Date().toISOString()});
  if(reducedMotion)return;
  setActive(true);
  const timer=window.setTimeout(()=>setActive(false),1800);
  return ()=>window.clearTimeout(timer);
 },[businessId,businessSlug,celebrationKey,reducedMotion,source,variant]);
 if(!celebrationKey||reducedMotion)return null;
 return <div className={`website-creation-celebration ${active?"active":""}${fullscreen?" fullscreen":""}`} aria-hidden="true">{variant==="car_detailing_reveal"?<div className="website-celebration-detailing"><div className="website-celebration-soap"/><div className="website-celebration-squeegee"><span/><b/></div></div>:<div className="website-celebration-confetti">{particles.map(particle=><i key={particle.id} style={{left:particle.left,animationDelay:particle.delay,animationDuration:particle.duration,rotate:particle.rotate}}/>)}</div>}</div>;
}
