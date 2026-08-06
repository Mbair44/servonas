"use client";
import {useEffect,useRef} from "react";

export function MarketingContentAttribution({content}:{content:string}){
 const recorded=useRef(false);
 useEffect(()=>{
  if(recorded.current)return;recorded.current=true;
  try{window.localStorage.setItem("servonas.utm_content",content);}catch{}
  for(const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href^="/signup"]')){const url=new URL(anchor.href,window.location.origin);url.searchParams.set("utm_content",content);anchor.href=`${url.pathname}${url.search}${url.hash}`;}
  void fetch("/api/marketing/content-lead",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({content}),keepalive:true});
 },[content]);
 return null;
}
