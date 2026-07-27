"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useMemo,useState} from "react";
import { signOut } from "@/app/auth/actions";
import {activeNavigationGroup,parseExpandedGroups,routeIsActive,SIDEBAR_GROUPS_STORAGE_KEY,visibleNavigation,workspaceNavigation} from "@/lib/workspaceNavigation";

export function WorkspaceNav({slug,name}:{slug:string;name:string}){
 const base=`/app/${slug}`;
 const pathname=usePathname(),items=useMemo(()=>visibleNavigation(workspaceNavigation(slug)),[slug]);
 const groupIds=useMemo(()=>items.filter(item=>item.children).map(item=>item.id),[items]);
 const activeGroup=activeNavigationGroup(pathname,items);
 const [expanded,setExpanded]=useState<string[]>(()=>activeGroup?[activeGroup]:[]);
 useEffect(()=>{
  const stored=parseExpandedGroups(window.localStorage.getItem(SIDEBAR_GROUPS_STORAGE_KEY),groupIds);
  setExpanded(activeGroup&&!stored.includes(activeGroup)?[...stored,activeGroup]:stored);
 },[activeGroup,groupIds]);
 const toggle=(id:string)=>{
  setExpanded(current=>{
   const next=current.includes(id)?current.filter(item=>item!==id):[...current,id];
   window.localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY,JSON.stringify(next));
   return next;
  });
 };
 return <aside className="epic3-sidebar"><Link href={base} className="epic3-brand"><img src="/servonas-logo-light.svg" alt="Servonas"/></Link><small className="workspace-context">{name}</small><nav aria-label="Workspace navigation">
  {items.map(item=>{
   if(item.children){
    const open=expanded.includes(item.id)||activeGroup===item.id;
    const parentActive=activeGroup===item.id;
    return <div className={`workspace-nav-group${parentActive?" active":""}`} key={item.id}>
     <button type="button" className="workspace-nav-toggle" aria-expanded={open} aria-controls={`workspace-nav-${item.id}`} onClick={()=>toggle(item.id)}><span>{item.label}</span><i aria-hidden="true">⌄</i></button>
     <div id={`workspace-nav-${item.id}`} className="workspace-nav-children" hidden={!open}>
      {item.children.map(child=>{
       const active=routeIsActive(pathname,child);
       return child.disabled?<span className="workspace-nav-disabled" aria-disabled="true" key={child.id}><span>{child.label}</span>{child.badge&&<em>{child.badge}</em>}</span>:
        <Link href={child.href!} aria-current={active?"page":undefined} className={active?"active":undefined} key={child.id}>{child.label}{child.badge&&<em>{child.badge}</em>}</Link>;
      })}
     </div>
    </div>;
   }
   const active=routeIsActive(pathname,item);
   return <Link className={`${item.id==="settings"?"workspace-nav-settings ":""}${active?"active":""}`} aria-current={active?"page":undefined} href={item.href!} key={item.id}>{item.label}</Link>;
  })}
 </nav><form action={signOut}><button className="workspace-logout">Log out</button></form></aside>
}
