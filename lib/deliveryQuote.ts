import type {SupabaseClient} from "@supabase/supabase-js";
import {addressFingerprint,type StructuredAddress} from "@/lib/geocoding/domain";
import {resolveGoogleAddress,type VerifiedGoogleAddress} from "@/lib/googleAddress";
import {calculateDeliveryPrice,type DeliveryPricingSettings,type DeliveryTier} from "@/lib/deliveryPricing";

type Point={latitude:number;longitude:number};
type DeliveryRow={
 enabled:boolean;origin_address_line1:string|null;origin_address_line2:string|null;origin_city:string|null;origin_state:string|null;origin_postal_code:string|null;origin_country_code:string|null;origin_place_id:string|null;origin_latitude:number|null;origin_longitude:number|null;
 pricing_method:string;free_radius_miles:number;per_mile_rate_cents:number;minimum_fee_cents:number;maximum_distance_miles:number|null;outside_area_action:string;long_distance_fee_cents:number;delivery_taxable:boolean;tiers:unknown;
};
export type DeliveryQuote={enabled:boolean;eligible:boolean;requiresQuote:boolean;insideServiceArea:boolean;distanceMiles:number;feeCents:number;taxCents:number;taxable:boolean;ruleLabel:string;snapshot:{origin:Record<string,unknown>;destination:Record<string,unknown>;pricingMethod:string;rule:Record<string,unknown>;provider:string;providerMetadata:Record<string,unknown>;calculatedAt:string}};

const structured=(row:DeliveryRow):StructuredAddress|null=>row.origin_address_line1&&row.origin_city&&row.origin_state?{line1:row.origin_address_line1,line2:row.origin_address_line2,city:row.origin_city,region:row.origin_state,postalCode:row.origin_postal_code,countryCode:row.origin_country_code||"US"}:null;
const destinationAddress=(value:VerifiedGoogleAddress):StructuredAddress=>({line1:value.streetAddress,line2:value.unit||null,city:value.city,region:value.state,postalCode:value.postalCode,countryCode:value.country||"US"});
const point=(latitude:number|null,longitude:number|null):Point|null=>Number.isFinite(latitude)&&Number.isFinite(longitude)?{latitude:Number(latitude),longitude:Number(longitude)}:null;
const settingsFrom=(row:DeliveryRow):DeliveryPricingSettings=>({enabled:row.enabled,pricingMethod:row.pricing_method==="per_mile"?"per_mile":"distance_tiers",freeRadiusMiles:Number(row.free_radius_miles),tiers:(Array.isArray(row.tiers)?row.tiers:[]).map(value=>value as DeliveryTier),perMileRateCents:Number(row.per_mile_rate_cents),minimumFeeCents:Number(row.minimum_fee_cents),maximumDistanceMiles:row.maximum_distance_miles==null?null:Number(row.maximum_distance_miles),outsideAreaAction:row.outside_area_action==="block"||row.outside_area_action==="long_distance_fee"?row.outside_area_action:"request_quote",longDistanceFeeCents:Number(row.long_distance_fee_cents)});

async function routeDistance(origin:Point,destination:Point){
 const apiKey=process.env.GOOGLE_MAPS_API_KEY;if(!apiKey)throw new Error("missing_api_key");
 const response=await fetch("https://routes.googleapis.com/directions/v2:computeRoutes",{method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":apiKey,"X-Goog-FieldMask":"routes.distanceMeters,routes.duration"},body:JSON.stringify({origin:{location:{latLng:{latitude:origin.latitude,longitude:origin.longitude}}},destination:{location:{latLng:{latitude:destination.latitude,longitude:destination.longitude}}},travelMode:"DRIVE",routingPreference:"TRAFFIC_UNAWARE",units:"IMPERIAL"}),cache:"no-store"});
 const payload=await response.json().catch(()=>null) as {routes?:{distanceMeters?:number;duration?:string}[];error?:{status?:string}}|null;
 const route=payload?.routes?.[0];if(!response.ok||route?.distanceMeters==null)throw new Error(response.status===429?"rate_limited":payload?.error?.status||"route_unavailable");
 return{distanceMeters:route.distanceMeters,durationSeconds:route.duration?Math.round(Number.parseFloat(route.duration)):null};
}

export async function quoteBusinessDelivery(db:SupabaseClient,businessId:string,destination:VerifiedGoogleAddress):Promise<DeliveryQuote|null>{
 const [{data:row,error},{data:billing}]=await Promise.all([
  db.from("delivery_fee_settings").select("*").eq("business_id",businessId).maybeSingle(),
  db.from("business_billing_settings").select("tax_enabled,default_tax_rate_basis_points").eq("business_id",businessId).maybeSingle(),
 ]);
 if(error)throw new Error(`delivery_settings_${error.code}`);if(!row||!row.enabled)return null;
 const originAddress=structured(row as DeliveryRow);if(!originAddress)throw new Error("origin_address_missing");
 let originPoint=point(row.origin_latitude,row.origin_longitude);
 if(!originPoint){
  const resolved=await resolveGoogleAddress(originAddress,row.origin_place_id);if(resolved.status!=="verified"||!resolved.coordinates)throw new Error("origin_address_unverified");
  originPoint=resolved.coordinates;
  await db.from("delivery_fee_settings").update({origin_latitude:originPoint.latitude,origin_longitude:originPoint.longitude,origin_place_id:resolved.providerPlaceId,updated_at:new Date().toISOString()}).eq("business_id",businessId);
 }
 const destinationPoint=point(destination.latitude,destination.longitude);if(!destinationPoint)throw new Error("destination_address_unverified");
 const destinationStructured=destinationAddress(destination),originKey=addressFingerprint(originAddress),destinationKey=addressFingerprint(destinationStructured),now=new Date();
 const {data:cached}=await db.from("delivery_route_cache").select("distance_meters,duration_seconds,provider_metadata").eq("business_id",businessId).eq("origin_fingerprint",originKey).eq("destination_fingerprint",destinationKey).gt("expires_at",now.toISOString()).maybeSingle();
 const routed=cached?{distanceMeters:Number(cached.distance_meters),durationSeconds:cached.duration_seconds==null?null:Number(cached.duration_seconds)}:await routeDistance(originPoint,destinationPoint);
 if(!cached)await db.from("delivery_route_cache").upsert({business_id:businessId,origin_fingerprint:originKey,destination_fingerprint:destinationKey,provider:"google_routes",distance_meters:routed.distanceMeters,duration_seconds:routed.durationSeconds,provider_metadata:{mode:"DRIVE"},expires_at:new Date(Date.now()+30*24*60*60*1000).toISOString()},{onConflict:"business_id,origin_fingerprint,destination_fingerprint"});
 const distanceMiles=Math.round((routed.distanceMeters/1609.344)*10)/10,price=calculateDeliveryPrice(distanceMiles,settingsFrom(row as DeliveryRow)),calculatedAt=now.toISOString();
 const taxable=Boolean(row.delivery_taxable&&billing?.tax_enabled),taxRateBasisPoints=taxable?Number(billing?.default_tax_rate_basis_points??0):0,taxCents=Math.round(price.feeCents*taxRateBasisPoints/10000);
 return{enabled:true,...price,distanceMiles,taxCents,taxable,snapshot:{origin:{...originAddress,formattedAddress:[originAddress.line1,originAddress.line2,originAddress.city,originAddress.region,originAddress.postalCode].filter(Boolean).join(", ")},destination:{...destinationStructured,formattedAddress:destination.formattedAddress,placeId:null},pricingMethod:row.pricing_method,rule:{...price.ruleSnapshot,taxable,taxRateBasisPoints,taxCents},provider:"google_routes",providerMetadata:{distanceMeters:routed.distanceMeters,durationSeconds:routed.durationSeconds,cacheHit:Boolean(cached)},calculatedAt}};
}

export function deliveryQuoteMessage(error:unknown){
 const code=error instanceof Error?error.message:"unknown";
 if(code==="origin_address_missing"||code==="origin_address_unverified")return "This business needs to finish setting its starting address before delivery can be calculated.";
 if(code==="destination_address_unverified")return "We couldn't verify that delivery address. Choose an address suggestion and try again.";
 return "We couldn't calculate delivery for this address yet. Please confirm your address or request a quote.";
}
