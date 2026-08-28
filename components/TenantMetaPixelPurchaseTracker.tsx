"use client";

import {useEffect} from "react";
import {trackMetaStandardEvent} from "./TenantMetaPixel";

export function TenantMetaPixelPurchaseTracker({bookingId,contentIds,numItems,value,currency="USD",contentName}:{bookingId:string;contentIds:string[];numItems:number;value?:number|null;currency?:string;contentName?:string}){
 useEffect(()=>{
  trackMetaStandardEvent("Purchase",{content_name:contentName,content_ids:contentIds,content_type:"product",num_items:numItems,value:value!=null?value:undefined,currency:value!=null?currency:undefined},{eventKey:`purchase:${bookingId}`,storage:"local"});
 },[bookingId,contentIds,contentName,currency,numItems,value]);
 return null;
}
