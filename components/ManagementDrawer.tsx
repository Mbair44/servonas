"use client";
import {useEffect,useRef,type ReactNode} from "react";

export function ManagementDrawer({open,title,onDirty,onClose,children,size="standard"}:{
 open:boolean;title:string;onDirty:()=>void;onClose:()=>void;children:ReactNode;size?:"compact"|"standard";
}){
 const panel=useRef<HTMLElement>(null);
 const onCloseRef=useRef(onClose);
 onCloseRef.current=onClose;
 useEffect(()=>{
  if(!open)return;
  const previous=document.activeElement as HTMLElement|null;
  const originalOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  requestAnimationFrame(()=>panel.current?.querySelector<HTMLElement>("input,select,textarea,button,a[href]")?.focus());
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();onCloseRef.current();return;}
   if(event.key!=="Tab"||!panel.current)return;
   const focusable=[...panel.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])")];
   if(!focusable.length)return;
   const first=focusable[0],last=focusable[focusable.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener("keydown",keydown);
  return()=>{document.removeEventListener("keydown",keydown);document.body.style.overflow=originalOverflow;previous?.focus();};
 },[open]);
 const close=()=>onClose();
 if(!open)return null;
 return <div className="management-drawer-layer" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
  <section ref={panel} className={`management-drawer ${size}`} role="dialog" aria-modal="true" aria-labelledby="management-drawer-title" onChange={onDirty}>
   <header><div><h2 id="management-drawer-title">{title}</h2></div><button type="button" onClick={close} aria-label={`Close ${title}`}>×</button></header>
   <div className="management-drawer-body">{children}</div>
  </section>
 </div>;
}
