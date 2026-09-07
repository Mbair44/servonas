"use client";

import {useEffect} from "react";
import {trackMetaStandardEvent} from "./TenantMetaPixel";

export function TenantMetaInitiateCheckoutTracker({eventId,contentIds,numItems,value}:{eventId:string;contentIds:string[];numItems:number;value:number}){
 useEffect(()=>{
  trackMetaStandardEvent("InitiateCheckout",{content_ids:contentIds,content_type:"product",num_items:numItems,value:value>0?value:undefined,currency:value>0?"USD":undefined},{eventId,storage:"session"});
 },[contentIds,eventId,numItems,value]);
 return null;
}
