"use client";

import {useEffect} from "react";
import {trackMetaServerEvent,trackMetaStandardEvent} from "./TenantMetaPixel";

export function TenantMetaPixelPurchaseTracker({bookingId,businessSlug,contentIds,numItems,value,currency="USD",contentName}:{bookingId:string;businessSlug?:string|null;contentIds:string[];numItems:number;value?:number|null;currency?:string;contentName?:string}){
 useEffect(()=>{
  const eventId=`purchase-${bookingId}`,params={content_name:contentName,content_ids:contentIds,content_type:"product",num_items:numItems,value:value!=null?value:undefined,currency:value!=null?currency:undefined};
  if(trackMetaStandardEvent("Purchase",params,{eventId,storage:"local"})&&businessSlug)trackMetaServerEvent(businessSlug,"Purchase",params,eventId,undefined,bookingId);
 },[bookingId,businessSlug,contentIds,contentName,currency,numItems,value]);
 return null;
}
