"use client";

import {usePathname,useRouter,useSearchParams} from "next/navigation";
import {useEffect,useRef,useState} from "react";
import {AssistantClient} from "@/app/app/[businessSlug]/assistant/AssistantClient";

type Message={id:string;role:"user"|"assistant";content:string;actionRequest?:{id:string;status:string;summary:string}};

function AssistantIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 13.7 8.3 19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m18.5 16 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></svg>}

export function AssistantPopover(){
 const pathname=usePathname(),search=useSearchParams(),router=useRouter(),match=pathname.match(/^\/app\/([^/]+)/),businessSlug=match?.[1]??null;
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[loaded,setLoaded]=useState(false),[retry,setRetry]=useState(0),[error,setError]=useState(""),[conversationId,setConversationId]=useState<string|null>(null),[messages,setMessages]=useState<Message[]>([]),panel=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null);
 useEffect(()=>{setOpen(false);setLoaded(false);setConversationId(null);setMessages([]);setError("");},[businessSlug]);
 useEffect(()=>{if(search.get("assistant")==="open"&&businessSlug){setOpen(true);const params=new URLSearchParams(search.toString());params.delete("assistant");router.replace(`${pathname}${params.size?`?${params}`:""}`,{scroll:false});}},[businessSlug,pathname,router,search]);
 useEffect(()=>{if(!open||!businessSlug||loaded)return;let active=true;setLoading(true);setError("");void fetch(`/api/assistant/${businessSlug}`,{cache:"no-store"}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||"Assistant could not be loaded.");if(active){setConversationId(body.conversationId??null);setMessages(body.messages??[]);setLoaded(true);}}).catch(caught=>{if(active)setError(caught instanceof Error?caught.message:"Assistant could not be loaded.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[businessSlug,loaded,open,retry]);
 useEffect(()=>{if(!open)return;const focus=setTimeout(()=>panel.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus(),80);const outside=(event:PointerEvent)=>{if(panel.current&&!panel.current.contains(event.target as Node)&&!button.current?.contains(event.target as Node))setOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);button.current?.focus();}};document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);return()=>{clearTimeout(focus);document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);};},[open,loaded]);
 if(!businessSlug)return null;
 return <div className="assistant-popover"><button ref={button} type="button" className={open?"active":undefined} aria-label="Open Servonas Assistant" aria-expanded={open} aria-controls="servonas-assistant-panel" onClick={()=>setOpen(current=>!current)}><AssistantIcon/><span>Assistant</span></button>{open&&<div ref={panel} id="servonas-assistant-panel" className="assistant-popover-panel" role="dialog" aria-label="Servonas Assistant"><header><div><span>Servonas AI</span><strong>Assistant</strong></div><button type="button" onClick={()=>setOpen(false)} aria-label="Close Assistant">×</button></header>{loading?<div className="assistant-popover-loading">Loading your conversation…</div>:error?<div className="workspace-notice error">{error}<button type="button" className="text-button" onClick={()=>setRetry(current=>current+1)}>Try again</button></div>:<AssistantClient key={conversationId??"new"} businessSlug={businessSlug} initialConversationId={conversationId} initialMessages={messages}/>}</div>}</div>;
}
