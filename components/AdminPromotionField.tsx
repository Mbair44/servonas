"use client";
import {useEffect,useRef,useState} from "react";
import {useParams} from "next/navigation";
import {previewAdminDiscount} from "@/lib/adminDiscountPreview";
import type {DiscountSnapshot} from "@/lib/discounts";
export function AdminPromotionField({subtotalCents,customerId,initialSnapshot,onDiscount}:{subtotalCents:number;customerId?:string;initialSnapshot?:DiscountSnapshot|null;onDiscount:(cents:number)=>void}){
 const params=useParams<{businessSlug:string}>(),[code,setCode]=useState(""),[message,setMessage]=useState(initialSnapshot?`${initialSnapshot.name}${initialSnapshot.tierLabel?` · ${initialSnapshot.tierLabel}`:""} (saved discount)`:""),[busy,setBusy]=useState(false);
 const previousSubtotal=useRef(subtotalCents);
 useEffect(()=>{if(previousSubtotal.current!==subtotalCents&&initialSnapshot?.code&&!code)setCode(initialSnapshot.code);previousSubtotal.current=subtotalCents;},[subtotalCents,initialSnapshot,code]);
 const callback=useRef(onDiscount);callback.current=onDiscount;
 useEffect(()=>{
  if(!code.trim()){setBusy(false);return;}
  let current=true;setBusy(true);
  const timer=setTimeout(()=>{previewAdminDiscount(params.businessSlug,code,subtotalCents,customerId).then(result=>{
   if(!current)return;
   if(result.ok){callback.current(result.discountCents);setMessage(`${result.name}${result.snapshot.tierLabel?` · ${result.snapshot.tierLabel}`:""} — saves $${(result.discountCents/100).toFixed(2)}`);}
   else{callback.current(0);setMessage(result.error);}
  }).catch(()=>{if(current){callback.current(0);setMessage("The promotion could not be checked. Try again.");}}).finally(()=>{if(current)setBusy(false);});},250);
  return()=>{current=false;clearTimeout(timer);};
 },[code,subtotalCents,customerId,params.businessSlug]);
 return <label className="wide">Promotion code<input name="promoCode" value={code} onChange={event=>{setCode(event.target.value);if(!event.target.value.trim()){callback.current(0);setMessage("");}}} placeholder="Optional promo code"/><small>Use an order promotion. The subtotal must contain rentals only; enter delivery and taxes separately. Saving recalculates the promotion.</small>{(busy||message)&&<small role="status">{busy?"Recalculating promotion…":message}</small>}</label>;
}
