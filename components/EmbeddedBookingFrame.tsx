"use client";

import {useEffect,useRef,useState} from "react";

export function EmbeddedBookingFrame({src,title}:{src:string;title:string}){
 const frame=useRef<HTMLIFrameElement>(null),[height,setHeight]=useState(900);
 useEffect(()=>{
  const message=(event:MessageEvent)=>{if(event.source!==frame.current?.contentWindow)return;if(event.data?.type==="servonas:booking-confirmed"){frame.current?.scrollIntoView({behavior:"smooth",block:"start"});return;}if(event.data?.type!=="servonas:booking-height")return;const next=Number(event.data.height);if(Number.isFinite(next)&&next>=400&&next<=10000)setHeight(Math.ceil(next));};
  const click=(event:MouseEvent)=>{const anchor=(event.target as HTMLElement|null)?.closest<HTMLAnchorElement>('a[href="#book-online"]');if(!anchor)return;event.preventDefault();frame.current?.scrollIntoView({behavior:"smooth",block:"start"});window.setTimeout(()=>frame.current?.contentWindow?.postMessage({type:"servonas:focus-calendar"},"*"),450);};
  window.addEventListener("message",message);document.addEventListener("click",click);
  return()=>{window.removeEventListener("message",message);document.removeEventListener("click",click)};
 },[]);
 return <iframe ref={frame} src={src} title={title} loading="lazy" scrolling="no" style={{height}}/>;
}
