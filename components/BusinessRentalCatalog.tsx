"use client";
import {useMemo,useState} from "react";
import type {BusinessSiteRentalItem} from "./BusinessWebsite";
import {RentalPricingFooter} from "./RentalPricingFooter";

export function BusinessRentalCatalog({items}:{items:BusinessSiteRentalItem[]}){
 const [category,setCategory]=useState("All rentals"),[search,setSearch]=useState("");
 const categories=useMemo(()=>["All rentals",...Array.from(new Set(items.map(item=>item.category||"Other rentals")))],[items]);
 const visible=useMemo(()=>{const query=search.trim().toLowerCase();return items.filter(item=>(category==="All rentals"||(item.category||"Other rentals")===category)&&(!query||`${item.name} ${item.description??""} ${item.category??""}`.toLowerCase().includes(query)));},[category,items,search]);
 return <>
  <div className="business-site-rental-tools">
   <label><span>Search rentals</span><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Bounce houses, tables, chairs…"/></label>
   <label><span>Category</span><select value={category} onChange={event=>setCategory(event.target.value)}>{categories.map(value=><option value={value} key={value}>{value}</option>)}</select></label>
  </div>
 {visible.length?<div className="business-site-rental-grid">{visible.map(item=><article className="business-site-rental-card" key={item.id}>
   <div className="business-site-rental-media">{item.imageUrl?<img src={item.imageUrl} alt={item.name}/>:<div className="business-site-rental-placeholder" aria-hidden="true">{item.name.slice(0,1)}</div>}</div>
   <div className="business-site-rental-content">
    <div className="business-site-rental-copy">{item.category&&<span>{item.category}</span>}<h3>{item.name}</h3>{item.description&&<p>{item.description}</p>}</div>
    <RentalPricingFooter priceCents={item.dailyPriceCents} rentalHours={item.standardRentalHours} multiDayMessage={item.multiDayMessage} action={<a href="#book-online" data-rental-item-id={item.id} aria-label={`Check availability for ${item.name}`}>Check availability</a>}/>
   </div>
  </article>)}</div>:<div className="business-site-rental-empty"><strong>No rentals match those filters.</strong><p>Choose another category or clear your search.</p></div>}
 </>;
}
