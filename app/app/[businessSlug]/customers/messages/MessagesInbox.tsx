"use client";
import {useEffect,useRef,useState} from "react";
import {messageTime,type conversations} from "@/lib/customerMessages/model";
import {openConversation,refreshInbox,sendReply,recoverMessageHistory} from "./actions";
import styles from "./messages.module.css";
type Inbox=ReturnType<typeof conversations>;
type InitialTarget={key:string;customerId:string;phone:string;name:string};
const pollingIntervalMs=30_000;
const tabIsVisible=()=>document.visibilityState==="visible";
export function MessagesInbox({slug,initial,timezone,initialTarget}:{slug:string;initial:Inbox;timezone:string;initialTarget?:InitialTarget|null}){
 const [inbox,setInbox]=useState(initial),[selected,setSelected]=useState<string|null>(initialTarget?.key??null),[body,setBody]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const lock=useRef(false),version=useRef(0),request=useRef<{key:string;body:string;id:string}|null>(null);
 const existingThread=inbox.find(c=>c.key===selected),draftTarget=!existingThread&&selected===initialTarget?.key?initialTarget:null,thread=existingThread??(draftTarget?{...draftTarget,messages:[],unread:0}:undefined);
 const format=(date:string)=>new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:timezone}).format(new Date(date));
 useEffect(()=>{let stopped=false,running=false;
  async function recover(){if(running||stopped||!tabIsVisible())return;running=true;try{await recoverMessageHistory(slug);}catch{/* Ordinary inbox reads and replies remain available. */}finally{running=false;}}
  const onVisibilityChange=()=>{if(tabIsVisible())void recover();};
  void recover();const timer=setInterval(()=>void recover(),pollingIntervalMs);document.addEventListener("visibilitychange",onVisibilityChange);return()=>{stopped=true;clearInterval(timer);document.removeEventListener("visibilitychange",onVisibilityChange);};
 },[slug]);
 useEffect(()=>{let active=true,running=false;
  async function refresh(){if(running||lock.current||!tabIsVisible())return;running=true;const current=version.current;try{const next=await refreshInbox(slug);if(active&&current===version.current)setInbox(next);}catch{if(active)setError("Messages could not refresh. Check your connection and try again.");}finally{running=false;}}
  const onVisibilityChange=()=>{if(tabIsVisible())void refresh();};
  const timer=setInterval(()=>void refresh(),pollingIntervalMs);document.addEventListener("visibilitychange",onVisibilityChange);return()=>{active=false;clearInterval(timer);document.removeEventListener("visibilitychange",onVisibilityChange);};
 },[slug]);
 async function open(key:string){if(lock.current)return;const current=++version.current;setSelected(key);setBody("");setError("");try{const next=await openConversation(slug,key);if(current===version.current)setInbox(next);}catch(e){setError(e instanceof Error?e.message:"Could not open conversation.");}}
 async function send(event:React.FormEvent){event.preventDefault();if(lock.current||!thread||!body.trim())return;lock.current=true;setBusy(true);setError("");++version.current;
 const key=thread.key,text=body.trim();if(request.current?.key!==key||request.current.body!==text)request.current={key,body:text,id:crypto.randomUUID()};
 try{const result=await sendReply(slug,{key,body:text,requestId:request.current.id,target:draftTarget?{customerId:draftTarget.customerId,phone:draftTarget.phone}:undefined});if(result.error){setError(result.error);return;}if(result.message){const message=result.message;setInbox(current=>{const updated=current.map(c=>c.key===key?{...c,latest:message,messages:[...c.messages.filter(m=>m.id!==message.id),message]}:c);if(updated.some(c=>c.key===key))return updated.sort((a,b)=>messageTime(b.latest).localeCompare(messageTime(a.latest)));if(!thread)return updated;return[{key,name:thread.name,phone:thread.phone,messages:[message],latest:message,unread:0},...updated];});setBody("");request.current=null;}}
 catch{setError("Send confirmation was interrupted. Retry uses the same request to prevent a duplicate, or refresh to check delivery.");}finally{lock.current=false;setBusy(false);}
 }
 return <><div role="alert" className={error?"workspace-notice error":undefined}>{error}</div><div className={styles.layout}><aside className={styles.list} aria-label="Conversations">{inbox.length===0&&<p>No messages yet.</p>}{inbox.map(c=><button key={c.key} className={selected===c.key?styles.selected:undefined} onClick={()=>open(c.key)} disabled={busy} aria-pressed={selected===c.key}><strong>{c.name}</strong>{c.unread>0&&<span className={styles.badge} aria-label={`${c.unread} unread`}>{c.unread}</span>}<small>{format(messageTime(c.latest))}</small><span className={styles.preview}>{c.latest.direction==="inbound"?"Received: ":"Sent: "}{c.latest.body}</span></button>)}</aside><section className={styles.thread} aria-label="Message thread">{!thread?<p>Select a conversation to read and reply.</p>:<><header><h2>{thread.name}</h2><span>{thread.phone}</span>{thread.unread>0&&<button className="sv-button sv-secondary" onClick={()=>open(thread.key)} disabled={busy}>Open {thread.unread} unread {thread.unread===1?"message":"messages"}</button>}</header><div className={styles.messages} aria-live="polite">{thread.messages.map(m=><article key={m.id} className={m.direction==="outbound"?styles.outbound:styles.inbound}><small>{m.direction==="inbound"?"Received":"Sent"}{m.direction==="inbound"&&!m.read_at?" · Unread":""}</small><p>{m.body}</p><small><time dateTime={messageTime(m)}>{format(messageTime(m))}</time> · {m.status}</small></article>)}</div><form onSubmit={send} className={styles.composer}><label htmlFor="reply-message">Reply</label><textarea id="reply-message" placeholder="Type a message..." value={body} onChange={e=>setBody(e.target.value)} maxLength={1600} rows={3} disabled={busy}/><button className="sv-button" disabled={busy||!body.trim()}>{busy?"Sending…":"Send"}</button></form></>}</section></div></>;
}
