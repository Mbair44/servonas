"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useMemo,useState} from "react";
import {activeNavigationGroup,parseExpandedGroups,routeIsActive,SIDEBAR_GROUPS_STORAGE_KEY,visibleNavigation,workspaceNavigation} from "@/lib/workspaceNavigation";

export function WorkspaceNav({slug,name,poolService=false}:{slug:string;name:string;poolService?:boolean}){
 const base=`/app/${slug}`;
 const pathname=usePathname(),items=useMemo(()=>visibleNavigation(workspaceNavigation(slug,{poolService})),[poolService,slug]);
 const groupIds=useMemo(()=>items.filter(item=>item.children).map(item=>item.id),[items]);
 const activeGroup=activeNavigationGroup(pathname,items);
 const [expanded,setExpanded]=useState<string|null>(()=>activeGroup??null);
 const [collapsed,setCollapsed]=useState(false);
 useEffect(()=>{
  const stored=parseExpandedGroups(window.localStorage.getItem(SIDEBAR_GROUPS_STORAGE_KEY),groupIds);
  setExpanded(activeGroup??stored[0]??null);
  setCollapsed(window.localStorage.getItem("servonas.sidebar.collapsed.v1")==="true");
 },[activeGroup,groupIds]);
 const toggle=(id:string)=>{
  setExpanded(current=>{
   const next=current===id?null:id;
   window.localStorage.setItem(SIDEBAR_GROUPS_STORAGE_KEY,JSON.stringify(next?[next]:[]));
   return next;
  });
 };
 const toggleSidebar=()=>{
  setCollapsed(current=>{
   const next=!current;
   window.localStorage.setItem("servonas.sidebar.collapsed.v1",String(next));
   return next;
  });
 };
 return <aside className={`epic3-sidebar${collapsed?" collapsed":""}`}><div className="workspace-nav-header"><Link href={base} className="epic3-brand"><img src="/servonas-logo-light.svg" alt="Servonas"/></Link><button type="button" className="workspace-sidebar-control" onClick={toggleSidebar} aria-expanded={!collapsed} aria-label={collapsed?"Open workspace navigation":"Close workspace navigation"} title={collapsed?"Open navigation":"Close navigation"}>{collapsed?"›":"‹"}</button></div><small className="workspace-context">{name}</small><nav aria-label="Workspace navigation">
  {items.map(item=>{
   if(item.children){
    const open=expanded===item.id;
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
   return <Link className={active?"active":undefined} aria-current={active?"page":undefined} href={item.href!} key={item.id}>{item.label}</Link>;
  })}
 </nav></aside>
}
