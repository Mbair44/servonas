"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useRef} from "react";
import {signOut} from "@/app/auth/actions";

type IconName="settings"|"profile"|"members"|"invoices"|"switch"|"news"|"help"|"logout";
function AccountIcon({name}:{name:IconName}){
 const common={fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
 return <svg viewBox="0 0 24 24" aria-hidden="true">
  {name==="settings"&&<><circle {...common} cx="12" cy="12" r="3"/><path {...common} d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></>}
  {name==="profile"&&<><circle {...common} cx="12" cy="8" r="3.5"/><path {...common} d="M5 21a7 7 0 0 1 14 0"/></>}
  {name==="members"&&<><circle {...common} cx="9" cy="8" r="3"/><path {...common} d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.5M17 14a5 5 0 0 1 4 5"/></>}
  {name==="invoices"&&<><rect {...common} x="4" y="3" width="16" height="18" rx="2"/><path {...common} d="M8 8h8M8 12h8M8 16h5"/></>}
  {name==="switch"&&<><circle {...common} cx="12" cy="12" r="9"/><path {...common} d="m8 9 3-3 3 3M16 15l-3 3-3-3"/></>}
  {name==="news"&&<><path {...common} d="M5 4h12a2 2 0 0 1 2 2v14H6a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2z"/><path {...common} d="M7 8h8M7 12h8M7 16h5"/></>}
  {name==="help"&&<><circle {...common} cx="12" cy="12" r="9"/><path {...common} d="M9.7 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.1.9-1.1 1.8M12 17h.01"/></>}
  {name==="logout"&&<><path {...common} d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M18 12H8"/></>}
 </svg>;
}
const item=(icon:IconName,title:string,description:string,href:string,className="")=><Link className={className} href={href}><i><AccountIcon name={icon}/></i><span><strong>{title}</strong><small>{description}</small></span></Link>;

export function AuthenticatedAccountMenu({name,email}:{name:string;email:string}){
 const pathname=usePathname(),menuRef=useRef<HTMLDetailsElement>(null);
 const match=pathname.match(/^\/app\/([^/]+)/),slug=match?.[1]??null;
 const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join("")||"U";
 useEffect(()=>{
  const closeOnOutside=(event:PointerEvent)=>{if(menuRef.current?.open&&!menuRef.current.contains(event.target as Node))menuRef.current.open=false;};
  const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&menuRef.current?.open){menuRef.current.open=false;menuRef.current.querySelector("summary")?.focus();}};
  document.addEventListener("pointerdown",closeOnOutside);document.addEventListener("keydown",closeOnEscape);
  return ()=>{document.removeEventListener("pointerdown",closeOnOutside);document.removeEventListener("keydown",closeOnEscape);};
 },[]);
 return <details ref={menuRef} className="account-menu">
  <summary aria-label="Open account menu"><span className="account-menu-avatar">{initials}</span><span><strong>{name}</strong></span><b aria-hidden="true">⌄</b></summary>
  <div className="account-menu-popover">
   <header><span className="account-menu-avatar">{initials}</span><span><strong>{name}</strong><small>{email}</small></span></header>
   {slug&&<section><b>Workspace</b>{item("settings","Business Settings","Manage your business details",`/app/${slug}/settings`)}{item("profile","My Profile","View your employee profile",`/app/${slug}/profile`)}{item("members","Members","Manage team members and permissions",`/app/${slug}/team`)}{item("invoices","Billing","View customer invoices and payments",`/app/${slug}/invoices`)}</section>}
   <section>{item("switch","Switch Business","Change to a different business","/app","account-menu-switch")}</section>
   <section>{item("news","What’s New","See the latest Servonas features","/features")}{item("help","Help Center","Guides, support, and contact options","/contact")}</section>
   <form action={signOut}><button><i><AccountIcon name="logout"/></i><span><strong>Log Out</strong><small>Sign out of your account</small></span></button></form>
  </div>
 </details>;
}
