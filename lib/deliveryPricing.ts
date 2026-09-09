export type DeliveryTier={upToMiles:number;feeCents:number};
export type DeliveryPricingMethod="distance_tiers"|"per_mile";
export type OutsideAreaAction="block"|"request_quote"|"long_distance_fee";
export type DeliveryPricingSettings={
 enabled:boolean;pricingMethod:DeliveryPricingMethod;freeRadiusMiles:number;tiers:DeliveryTier[];
 perMileRateCents:number;minimumFeeCents:number;maximumDistanceMiles:number|null;
 outsideAreaAction:OutsideAreaAction;longDistanceFeeCents:number;
};
export type DeliveryPrice={eligible:boolean;requiresQuote:boolean;insideServiceArea:boolean;feeCents:number;ruleLabel:string;ruleSnapshot:Record<string,unknown>};

const positive=(value:number)=>Number.isFinite(value)&&value>=0;

export function validateDeliverySettings(settings:DeliveryPricingSettings):string|null{
 if(!positive(settings.freeRadiusMiles))return "Free delivery radius cannot be negative.";
 if(settings.maximumDistanceMiles!==null&&(!positive(settings.maximumDistanceMiles)||settings.maximumDistanceMiles<settings.freeRadiusMiles))return "Maximum service distance must be at least the free delivery radius.";
 if(!positive(settings.perMileRateCents)||!positive(settings.minimumFeeCents)||!positive(settings.longDistanceFeeCents))return "Delivery prices cannot be negative.";
 if(settings.pricingMethod==="distance_tiers"){
  let previous=settings.freeRadiusMiles;
  for(const tier of settings.tiers){
   if(!positive(tier.upToMiles)||!positive(tier.feeCents)||tier.upToMiles<=previous)return "Each delivery tier must end after the tier before it, without duplicate boundaries.";
   previous=tier.upToMiles;
  }
  if(settings.maximumDistanceMiles!==null&&previous>settings.maximumDistanceMiles)return "Maximum service distance cannot be smaller than a delivery tier.";
 }
 return null;
}

export function calculateDeliveryPrice(distanceMiles:number,settings:DeliveryPricingSettings):DeliveryPrice{
 if(!settings.enabled)return{eligible:true,requiresQuote:false,insideServiceArea:true,feeCents:0,ruleLabel:"Delivery pricing disabled",ruleSnapshot:{type:"disabled"}};
 if(!positive(distanceMiles))throw new Error("Driving distance must be zero or greater.");
 const outside=settings.maximumDistanceMiles!==null&&distanceMiles>settings.maximumDistanceMiles;
 if(outside){
  if(settings.outsideAreaAction==="long_distance_fee")return{eligible:true,requiresQuote:false,insideServiceArea:false,feeCents:settings.longDistanceFeeCents,ruleLabel:`Over ${settings.maximumDistanceMiles} miles`,ruleSnapshot:{type:"long_distance_fee",maximumDistanceMiles:settings.maximumDistanceMiles,feeCents:settings.longDistanceFeeCents}};
  return{eligible:false,requiresQuote:settings.outsideAreaAction==="request_quote",insideServiceArea:false,feeCents:0,ruleLabel:`Over ${settings.maximumDistanceMiles} miles`,ruleSnapshot:{type:settings.outsideAreaAction,maximumDistanceMiles:settings.maximumDistanceMiles}};
 }
 if(distanceMiles<=settings.freeRadiusMiles)return{eligible:true,requiresQuote:false,insideServiceArea:true,feeCents:0,ruleLabel:`Up to ${settings.freeRadiusMiles} miles`,ruleSnapshot:{type:"free_radius",upToMiles:settings.freeRadiusMiles}};
 if(settings.pricingMethod==="per_mile"){
  const paidMiles=Math.max(0,distanceMiles-settings.freeRadiusMiles),calculated=Math.round(paidMiles*settings.perMileRateCents),feeCents=Math.max(settings.minimumFeeCents,calculated);
  return{eligible:true,requiresQuote:false,insideServiceArea:true,feeCents,ruleLabel:`${paidMiles.toFixed(1)} paid miles`,ruleSnapshot:{type:"per_mile",freeRadiusMiles:settings.freeRadiusMiles,paidMiles,rateCents:settings.perMileRateCents,minimumFeeCents:settings.minimumFeeCents}};
 }
 const sorted=[...settings.tiers].sort((a,b)=>a.upToMiles-b.upToMiles),tier=sorted.find(item=>distanceMiles<=item.upToMiles);
 if(!tier)return{eligible:false,requiresQuote:true,insideServiceArea:false,feeCents:0,ruleLabel:"No delivery tier covers this address",ruleSnapshot:{type:"uncovered"}};
 const prior=sorted[sorted.indexOf(tier)-1]?.upToMiles??settings.freeRadiusMiles;
 return{eligible:true,requiresQuote:false,insideServiceArea:true,feeCents:tier.feeCents,ruleLabel:`${prior+1}-${tier.upToMiles} miles`,ruleSnapshot:{type:"distance_tier",overMiles:prior,upToMiles:tier.upToMiles,feeCents:tier.feeCents}};
}
