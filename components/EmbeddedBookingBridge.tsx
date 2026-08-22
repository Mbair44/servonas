"use client";

import {useEffect} from "react";

export function EmbeddedBookingBridge(){
 useEffect(()=>{
  let frame=0;
  const timers:number[]=[];
  let lastHeight=0;
  const measureHeight=()=>{
   const structuralHeight=Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.documentElement.clientHeight,document.body.scrollHeight,document.body.offsetHeight,document.body.clientHeight,window.innerHeight);
   const contentBottom=Math.max(
    ...Array.from(document.body.querySelectorAll<HTMLElement>("main, section, article, footer, div")).map(node=>Math.ceil(node.getBoundingClientRect().bottom+window.scrollY)),
    0,
   );
   return Math.max(structuralHeight,contentBottom);
  };
  const postHeight=(force=false)=>{const next=measureHeight();if(!force&&Math.abs(next-lastHeight)<4)return;lastHeight=next;window.parent.postMessage({type:"servonas:booking-height",height:next},"*");};
  const send=(force=false)=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>postHeight(force));};
  const scheduleSettledSync=()=>[120,320,800,1600,2600,4000].forEach(delay=>timers.push(window.setTimeout(()=>send(true),delay)));
  const handleLoad=()=>send(true);
  const handlePageShow=()=>send(true);
  const handleResize=()=>send();
  const handleFontsReady=()=>send(true);
  const resizeObserver=new ResizeObserver(()=>send());resizeObserver.observe(document.documentElement);resizeObserver.observe(document.body);
  const mutationObserver=new MutationObserver(()=>send());mutationObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
  document.querySelectorAll("img").forEach(image=>{
   if(image.complete)return;
   image.addEventListener("load",()=>send(true),{once:true});
   image.addEventListener("error",()=>send(true),{once:true});
  });
  send(true);scheduleSettledSync();
  timers.push(window.setInterval(()=>send(),500) as unknown as number);
  if("fonts" in document)void (document as Document&{fonts?:{ready?:Promise<unknown>}}).fonts?.ready?.then(handleFontsReady);
  window.addEventListener("load",handleLoad);window.addEventListener("resize",handleResize);window.addEventListener("pageshow",handlePageShow);
  return()=>{cancelAnimationFrame(frame);timers.forEach(timer=>{window.clearTimeout(timer);window.clearInterval(timer);});resizeObserver.disconnect();mutationObserver.disconnect();window.removeEventListener("load",handleLoad);window.removeEventListener("resize",handleResize);window.removeEventListener("pageshow",handlePageShow);};
 },[]);
 return null;
}
