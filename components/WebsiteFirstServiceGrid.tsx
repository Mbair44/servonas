"use client";

import {useState} from "react";

type ServiceOption={value:string;label:string;defaultSelected?:boolean;other?:boolean};

export function WebsiteFirstServiceGrid({heading,description,options,initialSelected,customOther=false}:{heading:string;description:string;options:ServiceOption[];initialSelected?:string[];customOther?:boolean}){
 const defaults=options.filter(option=>option.defaultSelected).map(option=>option.value),[selected,setSelected]=useState(()=>new Set(initialSelected?.length?initialSelected:defaults)),allSelected=selected.size===options.length;
 const toggle=(value:string)=>setSelected(current=>{const next=new Set(current);if(next.has(value))next.delete(value);else next.add(value);return next;});
 const toggleAll=()=>setSelected(allSelected?new Set():new Set(options.map(option=>option.value)));
 const otherSelected=options.some(option=>option.other&&selected.has(option.value));
 return <fieldset className="wide website-first-services"><legend>{heading}</legend><div className="website-first-services-heading"><p>{description}</p><button type="button" onClick={toggleAll}>{allSelected?"Clear all":"Select all"}</button></div><div className="website-first-service-grid">{options.map(option=>{const checked=selected.has(option.value);return <label className={checked?"selected":""} key={option.value}><input type="checkbox" name="services" value={option.value} checked={checked} onChange={()=>toggle(option.value)}/><i aria-hidden="true">{checked?"✓":option.other?"+":""}</i><span>{option.other?"Other":option.label}</span></label>;})}</div>{customOther&&otherSelected&&<label className="website-first-other-input">Other service<input name="customService" maxLength={100} placeholder="Tell us what else you offer"/></label>}</fieldset>;
}
