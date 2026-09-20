"use client";

import {useEffect, useState} from "react";

export function PromotionStickyCta({href}:{href:string}){
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  const hero=document.querySelector<HTMLElement>(".promotion-hero");
  if(!hero)return;
  const observer=new IntersectionObserver(([entry])=>setVisible(!entry.isIntersecting),{threshold:0.05});
  observer.observe(hero);
  return()=>observer.disconnect();
 },[]);
 if(!visible)return null;
 return <div className="promotion-sticky-cta"><a href={href} data-promotion-event="promotion_primary_cta_clicked">Save up to $75 · Check My Date</a></div>;
}
