"use client";

import {useEffect} from "react";

export function EmbeddedBookingBridge(){
 useEffect(()=>{
  let frame=0;
  const send=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>window.parent.postMessage({type:"servonas:booking-height",height:document.documentElement.scrollHeight},"*"));};
  const observer=new ResizeObserver(send);observer.observe(document.documentElement);observer.observe(document.body);send();
  window.addEventListener("load",send);return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener("load",send)};
 },[]);
 return null;
}
