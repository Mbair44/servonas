"use client";

import {stripeTaxCodeOptions} from "@/lib/stripeTaxCodes";

export function StripeTaxCodeInput({name,defaultValue,label="Stripe Tax code",listId}:{name:string;defaultValue?:string|null;label?:string;listId:string}){
 return <label>{label}<input name={name} maxLength={100} pattern="txcd_[A-Za-z0-9_]+" defaultValue={defaultValue??""} list={listId} placeholder="Search or enter a Stripe tax code"/><datalist id={listId}>{stripeTaxCodeOptions.map(option=><option key={option.id} value={option.id}>{`${option.name} — ${option.description}`}</option>)}</datalist><small>Start typing to search common Stripe classifications. For typical physical rental equipment, choose General — Tangible Goods.</small></label>;
}
