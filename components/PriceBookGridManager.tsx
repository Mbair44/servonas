"use client";

import {useMemo,useState} from "react";
import {ManagementDrawer} from "./ManagementDrawer";
import PriceBookForm from "./PriceBookForm";
import {ServiceCatalogForm} from "./ServiceCatalogForm";
import {formatCents,marginPercent} from "@/lib/financial/priceBook";
import type {PriceBookActionState,ServiceCatalogActionState} from "@/app/app/[businessSlug]/price-book/actions";

type Option={id:string;name:string};
type Item=Record<string,any>;
type Service={id:string;name:string;description:string|null;duration_minutes:number;price_amount:number|null;price_label:string;active:boolean;recurring_allowed:boolean;required_skills:string[]|null};
type Direction="asc"|"desc";
type ServiceSort="name"|"duration"|"price"|"recurring"|"status";
type ItemSort="name"|"category"|"price"|"margin"|"status";

function compareValues(a:string|number|boolean|null,b:string|number|boolean|null){
 if(a===b)return 0;
 if(a===null)return 1;
 if(b===null)return-1;
 if(typeof a==="string"&&typeof b==="string")return a.localeCompare(b,undefined,{numeric:true,sensitivity:"base"});
 return a<b?-1:1;
}
function SortHeader<T extends string>({column,label,sort,direction,onSort}:{column:T;label:string;sort:T;direction:Direction;onSort:(column:T)=>void}){
 const active=sort===column;
 return <span role="columnheader" aria-sort={active?(direction==="asc"?"ascending":"descending"):"none"}><button type="button" className={active?"active":""} onClick={()=>onSort(column)}>{label}<i aria-hidden="true">{active?(direction==="asc"?"↑":"↓"):"↕"}</i></button></span>;
}

export function PriceBookGridManager({items,services,categories,canEdit,updateItemAction,updateServiceAction,archiveItemAction}:{
 items:Item[];services:Service[];categories:Option[];canEdit:boolean;
 updateItemAction:(itemId:string,state:PriceBookActionState,data:FormData)=>Promise<PriceBookActionState>;
 updateServiceAction:(serviceId:string,state:ServiceCatalogActionState,data:FormData)=>Promise<ServiceCatalogActionState>;
 archiveItemAction:(itemId:string,archived:boolean)=>void|Promise<void>;
}){
 const [editingItem,setEditingItem]=useState<Item|null>(null);
 const [editingService,setEditingService]=useState<Service|null>(null);
 const [serviceSort,setServiceSort]=useState<ServiceSort>("name");
 const [serviceDirection,setServiceDirection]=useState<Direction>("asc");
 const [itemSort,setItemSort]=useState<ItemSort>("name");
 const [itemDirection,setItemDirection]=useState<Direction>("asc");
 const categoryName=(id:string|null)=>categories.find(item=>item.id===id)?.name??"Uncategorized";
 const changeServiceSort=(column:ServiceSort)=>{if(column===serviceSort)setServiceDirection(value=>value==="asc"?"desc":"asc");else{setServiceSort(column);setServiceDirection("asc");}};
 const changeItemSort=(column:ItemSort)=>{if(column===itemSort)setItemDirection(value=>value==="asc"?"desc":"asc");else{setItemSort(column);setItemDirection("asc");}};
 const sortedServices=useMemo(()=>[...services].sort((a,b)=>{
  const values=(service:Service):Record<ServiceSort,string|number|boolean|null>=>({name:service.name,duration:service.duration_minutes,price:service.price_amount,recurring:service.recurring_allowed,status:service.active});
  const result=compareValues(values(a)[serviceSort],values(b)[serviceSort]);
  return serviceDirection==="asc"?result:-result;
 }),[services,serviceSort,serviceDirection]);
 const sortedItems=useMemo(()=>[...items].sort((a,b)=>{
  const values=(item:Item):Record<ItemSort,string|number|boolean|null>=>({name:String(item.name),category:categoryName(item.category_id),price:Number(item.default_unit_price_cents),margin:marginPercent(item.default_unit_price_cents,item.internal_cost_cents),status:item.is_deleted?-1:item.is_active?1:0});
  const result=compareValues(values(a)[itemSort],values(b)[itemSort]);
  return itemDirection==="asc"?result:-result;
 // categories are stable server data used only to resolve the category sort label.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }),[items,itemSort,itemDirection,categories]);
 return <>
  <section className="workspace-panel price-book-directory" id="services">
   <div className="panel-title"><div><h2>Services</h2><span>Work available across booking, jobs, estimates, and service plans.</span></div><span>{services.length} service{services.length===1?"":"s"}</span></div>
   <div className="price-book-grid service-grid" role="table" aria-label="Services">
    <div className="price-book-grid-head" role="row"><SortHeader column="name" label="Service" sort={serviceSort} direction={serviceDirection} onSort={changeServiceSort}/><SortHeader column="duration" label="Duration" sort={serviceSort} direction={serviceDirection} onSort={changeServiceSort}/><SortHeader column="price" label="Price" sort={serviceSort} direction={serviceDirection} onSort={changeServiceSort}/><SortHeader column="recurring" label="Recurring" sort={serviceSort} direction={serviceDirection} onSort={changeServiceSort}/><SortHeader column="status" label="Status" sort={serviceSort} direction={serviceDirection} onSort={changeServiceSort}/><span role="columnheader">Actions</span></div>
    {sortedServices.length?sortedServices.map(service=><div className="price-book-grid-row" role="row" key={service.id}>
     <span className="price-book-grid-name" role="cell"><strong>{service.name}</strong><small>{service.description||"No description"}</small></span>
     <span role="cell">{service.duration_minutes} min</span>
     <span role="cell">{service.price_label==="quote"||service.price_amount===null?"Request quote":`${service.price_label==="starting_at"?"From ":""}$${Number(service.price_amount).toFixed(2)}`}</span>
     <span role="cell">{service.recurring_allowed?"Available":"One-time"}</span>
     <span role="cell"><b className={`employee-state ${service.active?"active":"inactive"}`}>{service.active?"Active":"Inactive"}</b></span>
     <span role="cell">{canEdit&&<button type="button" className="grid-edit-button" onClick={()=>setEditingService(service)}>Edit</button>}</span>
    </div>):<div className="dashboard-empty"><strong>No services yet</strong><p>Your onboarding service and future services will appear here.</p></div>}
   </div>
  </section>
  <section className="workspace-panel price-book-directory" id="items">
   <div className="panel-title"><div><h2>Items</h2><span>Reusable charges for estimates and invoices.</span></div><span>{items.length} result{items.length===1?"":"s"}</span></div>
   <div className="price-book-grid item-grid" role="table" aria-label="Price book items">
    <div className="price-book-grid-head" role="row"><SortHeader column="name" label="Item" sort={itemSort} direction={itemDirection} onSort={changeItemSort}/><SortHeader column="category" label="Category" sort={itemSort} direction={itemDirection} onSort={changeItemSort}/><SortHeader column="price" label="Price" sort={itemSort} direction={itemDirection} onSort={changeItemSort}/><SortHeader column="margin" label="Cost / margin" sort={itemSort} direction={itemDirection} onSort={changeItemSort}/><SortHeader column="status" label="Status" sort={itemSort} direction={itemDirection} onSort={changeItemSort}/><span role="columnheader">Actions</span></div>
    {sortedItems.length?sortedItems.map(item=>{const margin=marginPercent(item.default_unit_price_cents,item.internal_cost_cents);return <div className="price-book-grid-row" role="row" key={item.id}>
     <span className="price-book-grid-name" role="cell"><strong>{item.name}</strong><small>{item.description||"No description"}{item.sku?` · ${item.sku}`:""}</small></span>
     <span role="cell">{categoryName(item.category_id)}</span><span role="cell">{formatCents(item.default_unit_price_cents,item.currency)} / {String(item.unit_type).replaceAll("_"," ")}</span>
     <span role="cell">{formatCents(item.internal_cost_cents,item.currency)} · {margin===null?"—":`${margin.toFixed(2)}%`}</span>
     <span role="cell"><b className={`employee-state ${item.is_active&&!item.is_deleted?"active":"inactive"}`}>{item.is_deleted?"Archived":item.is_active?"Active":"Inactive"}</b></span>
     <span className="price-book-row-actions" role="cell">{canEdit&&<><button type="button" className="grid-edit-button" onClick={()=>setEditingItem(item)}>Edit</button><form action={archiveItemAction.bind(null,item.id,!item.is_deleted)}><button className="text-button">{item.is_deleted?"Restore":"Archive"}</button></form></>}</span>
    </div>}):<div className="dashboard-empty"><strong>No price book items</strong><p>Adjust the filters or add your first reusable item.</p></div>}
   </div>
  </section>
  <ManagementDrawer open={Boolean(editingService)} title="Edit service" subtitle={editingService?.name} onDirty={()=>{}} onClose={()=>setEditingService(null)} size="wide">
   {editingService&&<ServiceCatalogForm service={editingService} action={updateServiceAction.bind(null,editingService.id)} returnToPriceBook/>}
  </ManagementDrawer>
  <ManagementDrawer open={Boolean(editingItem)} title="Edit price book item" subtitle={editingItem?.name} onDirty={()=>{}} onClose={()=>setEditingItem(null)} size="wide">
   {editingItem&&<PriceBookForm action={updateItemAction.bind(null,editingItem.id)} categories={categories} services={services.map(({id,name})=>({id,name}))} item={editingItem} submitLabel="Save item" returnToPriceBook/>}
  </ManagementDrawer>
 </>;
}
