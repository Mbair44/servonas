"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {signOut} from "@/app/auth/actions";

const item=(icon:string,title:string,description:string,href:string,className="")=><Link className={className} href={href}><i aria-hidden="true">{icon}</i><span><strong>{title}</strong><small>{description}</small></span></Link>;

export function AuthenticatedAccountMenu({name,email}:{name:string;email:string}){
 const pathname=usePathname();
 const match=pathname.match(/^\/app\/([^/]+)/);
 const slug=match?.[1]??null;
 const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join("")||"U";
 return <details className="account-menu">
  <summary aria-label="Open account menu"><span className="account-menu-avatar">{initials}</span><span><strong>{name}</strong><small>{email}</small></span><b aria-hidden="true">⌄</b></summary>
  <div className="account-menu-popover">
   <header><span className="account-menu-avatar">{initials}</span><span><strong>{name}</strong><small>{email}</small></span></header>
   {slug&&<section><b>Workspace</b>{item("⚙","Business Settings","Manage your business details",`/app/${slug}/settings`)}{item("♙","My Profile","View your employee profile",`/app/${slug}/team`)}{item("♧","Members","Manage team members and permissions",`/app/${slug}/team`)}{item("▣","Billing","View payment and invoice settings",`/app/${slug}/settings/billing`)}</section>}
   <section>{item("◎","Switch Business","Change to a different business","/app","account-menu-switch")}</section>
   <section>{item("♧","What’s New","See the latest Servonas features","/features")}{item("?","Help Center","Guides, support, and contact options","/contact")}</section>
   <form action={signOut}><button><i aria-hidden="true">⇥</i><span><strong>Log Out</strong><small>Sign out of your account</small></span></button></form>
  </div>
 </details>;
}
