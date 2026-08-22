"use client";

import {useEffect} from "react";

export function EmbeddedBookingBridge(){
 useEffect(()=>{
  let frame=0;
  const timers:number[]=[];
  const measureHeight=()=>Math.max(document.documentElement.scrollHeight,document.documentElement.offsetHeight,document.documentElement.clientHeight,document.body.scrollHeight,document.body.offsetHeight,document.body.clientHeight);
  const send=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>window.parent.postMessage({type:"servonas:booking-height",height:measureHeight()},"*"));};
  const scheduleSettledSync=()=>[120,320,800,1600].forEach(delay=>timers.push(window.setTimeout(send,delay)));
  const observer=new ResizeObserver(send);observer.observe(document.documentElement);observer.observe(document.body);send();scheduleSettledSync();
  if("fonts" in document)void (document as Document&{fonts?:{ready?:Promise<unknown>}}).fonts?.ready?.then(send);
  window.addEventListener("load",send);window.addEventListener("resize",send);window.addEventListener("pageshow",send);
  return()=>{cancelAnimationFrame(frame);timers.forEach(timer=>window.clearTimeout(timer));observer.disconnect();window.removeEventListener("load",send);window.removeEventListener("resize",send);window.removeEventListener("pageshow",send)};
 },[]);
 return null;
}
