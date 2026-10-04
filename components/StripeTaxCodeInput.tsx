"use client";

import {useEffect,useMemo,useState} from "react";
import {filterStripeTaxCodeOptions,stripeTaxCodeFallbackOptions,type StripeTaxCodeOption} from "@/lib/stripeTaxCodes";

export function StripeTaxCodeInput({name,defaultValue,label="Stripe Tax code",listId,allowClear=true}:{name:string;defaultValue?:string|null;label?:string;listId:string;allowClear?:boolean}){
 const [value,setValue]=useState(defaultValue??"");
 const [options,setOptions]=useState<StripeTaxCodeOption[]>(stripeTaxCodeFallbackOptions);
 const [focused,setFocused]=useState(false);
 useEffect(()=>{let active=true;fetch("/api/stripe-tax-codes").then(async response=>response.ok?response.json():null).then(payload=>{
  const remote=Array.isArray(payload?.taxCodes)?payload.taxCodes.filter((option:unknown):option is StripeTaxCodeOption=>Boolean(option&&typeof option==="object"&&typeof (option as StripeTaxCodeOption).id==="string"&&typeof (option as StripeTaxCodeOption).name==="string"&&typeof (option as StripeTaxCodeOption).description==="string"&&(option as StripeTaxCodeOption).id.startsWith("txcd_"))):[];
  if(active&&remote.length)setOptions(remote);
 }).catch(()=>{});return()=>{active=false;};},[]);
 const matches=useMemo(()=>filterStripeTaxCodeOptions(options,value),[options,value]);
 return <label>{label}<div className="stripe-tax-code-picker"><input role="combobox" name={name} maxLength={100} pattern="txcd_[A-Za-z0-9_]+" value={value} onChange={event=>setValue(event.target.value)} onFocus={()=>setFocused(true)} onBlur={()=>setTimeout(()=>setFocused(false),150)} aria-controls={listId} aria-expanded={focused} placeholder="Search Stripe Tax codes"/>{allowClear&&value?<button type="button" className="text-button" onMouseDown={event=>event.preventDefault()} onClick={()=>setValue("")}>Clear override</button>:null}{focused?<div id={listId} role="listbox" className="stripe-tax-code-options">{matches.length?matches.map(option=><button type="button" role="option" aria-selected={option.id===value} key={option.id} onMouseDown={event=>event.preventDefault()} onClick={()=>{setValue(option.id);setFocused(false);}}><strong>{option.name}</strong><code>{option.id}</code><small>{option.description}</small></button>):<small>No matching Stripe Tax code.</small>}</div>:null}</div><small>Search Stripe’s supported tax-code catalog. Select the classification your tax professional has confirmed for the rental.</small></label>;
}
