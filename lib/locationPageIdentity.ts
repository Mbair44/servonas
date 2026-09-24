/** Shared identity for recommendation cards and tenant-scoped draft creation. */
export function normalizedLocationKey(value:string,state?:string|null){
 const parts=state===undefined?value.split(","):[value,state??""];
 return parts.map(part=>part.trim().replace(/\s+/g," ").toLowerCase()).filter(Boolean).join(", ");
}

type LocationIdentity={id:string;source_location_key:string;city:string;state?:string|null};
export function findLocationPage<T extends LocationIdentity>(pages:T[],key:string){
 const normalized=normalizedLocationKey(key);
 return pages.find(page=>normalizedLocationKey(page.source_location_key)===normalized||normalizedLocationKey(page.city,page.state)===normalized)??null;
}

export function locationOpportunityAction(city:string,page:{status:string}|null){
 return page?{label:page.status==="published"?`Edit ${city} page`:`Review ${city} draft`,state:page.status==="published"?"Location page published":"Draft created"}:{label:`Create ${city} page`,state:"Ready to build"};
}
