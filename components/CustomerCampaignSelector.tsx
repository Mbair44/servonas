"use client";

import Link from "next/link";
import {useMemo,useState} from "react";

export type CampaignCustomerRow={id:string;href:string;selected:boolean;initials:string;name:string;subtitle:string;email:string;phone:string;type:string;active:boolean;locations:number;lastService:string;nextService:string;jobs:number};
export type CampaignCustomerHeader={label:string;href:string;active:boolean;direction:"asc"|"desc"};

export function CustomerCampaignSelector({businessSlug,canCreate,headers,rows}:{businessSlug:string;canCreate:boolean;headers:CampaignCustomerHeader[];rows:CampaignCustomerRow[]}){
 const [selected,setSelected]=useState<Set<string>>(()=>new Set());
 const allSelected=rows.length>0&&rows.every(row=>selected.has(row.id));
 const campaignHref=useMemo(()=>`/app/${businessSlug}/customers/campaigns/new?customers=${encodeURIComponent([...selected].join(","))}`,[businessSlug,selected]);
 const toggle=(id:string)=>setSelected(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});
 const toggleAll=()=>setSelected(current=>{const next=new Set(current);if(allSelected)rows.forEach(row=>next.delete(row.id));else rows.forEach(row=>next.add(row.id));return next;});
 return <div className="customer-table campaign-customer-table" role="table" aria-label="Customers">
  {canCreate&&selected.size>0&&<div className="campaign-selection-bar"><strong>{selected.size} customer{selected.size===1?"":"s"} selected</strong><span>Choose email or text after creating the campaign.</span><button type="button" onClick={()=>setSelected(new Set())}>Clear</button><Link className="sv-button" href={campaignHref}>Create campaign</Link></div>}
  <div className="customer-table-head campaign-selectable" role="row">{canCreate?<label className="campaign-select-cell"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all customers on this page"/></label>:<span/>}{headers.map(header=><span role="columnheader" key={header.label}><Link className={header.active?"active":""} href={header.href}>{header.label}<i aria-hidden="true">{header.active?(header.direction==="asc"?"↑":"↓"):"↕"}</i></Link></span>)}</div>
  {rows.length?rows.map(row=><div className={`customer-table-row${row.selected?" selected":""}`} role="row" key={row.id}>{canCreate?<label className="campaign-select-cell"><input type="checkbox" checked={selected.has(row.id)} onChange={()=>toggle(row.id)} aria-label={`Select ${row.name}`}/></label>:<span/>}<Link href={row.href}>
   <span className="employee-table-identity" role="cell"><span className="employee-table-avatar">{row.initials}</span><span><strong>{row.name}</strong><small>{row.subtitle}</small></span></span>
   <span className="customer-contact" role="cell"><strong>{row.email}</strong><small>{row.phone}</small></span><span role="cell"><em className={`customer-type ${row.type}`}>{row.type}</em></span><span role="cell"><b className={`employee-state ${row.active?"active":"inactive"}`}>● {row.active?"Active":"Inactive"}</b></span><span role="cell">{row.locations}</span><span role="cell">{row.lastService}</span><span role="cell">{row.nextService}</span><span role="cell">{row.jobs}</span>
  </Link></div>):<div className="dashboard-empty"><strong>No matching customers.</strong><p>Adjust the filters or add a customer.</p></div>}
 </div>;
}
