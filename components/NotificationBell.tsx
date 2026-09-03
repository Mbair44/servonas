"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {usePathname} from "next/navigation";

type InboxItem={id:string;title:string;body:string;category:string;status:string;priority:string;action_label:string|null;action_url:string|null;metadata?:Record<string,unknown>;created_at:string};
const workspaceSlug=(pathname:string)=>pathname.match(/^\/app\/([^/]+)/)?.[1]||null;
export function NotificationBell(){
 const pathname=usePathname(),slug=workspaceSlug(pathname),[open,setOpen]=useState(false),[items,setItems]=useState<InboxItem[]>([]),[unread,setUnread]=useState(0);
 useEffect(()=>{if(!slug){setItems([]);setUnread(0);return;}let active=true;const load=async()=>{try{const response=await fetch(`/api/business-notifications/${encodeURIComponent(slug)}`,{cache:"no-store"});if(!response.ok)return;const data=await response.json() as {notifications:InboxItem[];unread:number};if(active){setItems(data.notifications);setUnread(data.unread);}}catch{}};void load();const timer=window.setInterval(load,60000);return()=>{active=false;window.clearInterval(timer);};},[slug]);
 if(!slug)return null;
 const hasCritical=items.some(item=>item.priority==="urgent"||item.metadata?.severity==="critical");
 const openNotification=(item:InboxItem)=>{if(item.status==="unread"){void fetch(`/api/business-notifications/${encodeURIComponent(slug)}/${encodeURIComponent(item.id)}/read`,{method:"POST"});setUnread(count=>Math.max(0,count-1));setItems(current=>current.map(value=>value.id===item.id?{...value,status:"read"}:value));}setOpen(false);};
 return <details className="notification-bell" open={open} onToggle={event=>setOpen((event.currentTarget as HTMLDetailsElement).open)}><summary className={hasCritical?"has-critical":""} aria-label={`Notifications${unread?`, ${unread} unread`:""}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>{unread>0&&<b>{unread>99?"99+":unread}</b>}</summary><section className="notification-bell-panel"><header><div><strong>Notifications</strong><span>{unread?`${unread} unread`:"You're all caught up"}</span></div><Link href={`/app/${slug}/notifications`} onClick={()=>setOpen(false)}>View all</Link></header>{items.length?<div>{items.map(item=><Link key={item.id} href={item.action_url||`/app/${slug}/notifications?notification=${item.id}`} onClick={()=>openNotification(item)} className={`notification-preview ${item.priority}`}><i aria-hidden="true">{item.category==="reviews"?"*":item.metadata?.provider==="google_ads"?"G":"!"}</i><span><strong>{item.title}</strong><small>{item.body}</small><time>{new Date(item.created_at).toLocaleDateString()}</time></span>{item.action_label&&<em>{item.action_label}</em>}</Link>)}</div>:<p className="notification-empty">We’ll let you know when something needs your attention.</p>}</section></details>;
}
