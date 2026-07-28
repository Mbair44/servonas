import{entitlementCatalog,isEntitlementCode,type CapabilityCode,type EntitlementCode}from"./catalog.ts";
export const entitlementStatuses=["scheduled","active","grace_period","expired","suspended","canceled","superseded"]as const;
export type EntitlementStatus=(typeof entitlementStatuses)[number];
export type EntitlementRecord={id:string;entitlement_key:string;status:string;starts_at:string;ends_at:string|null;grace_period_ends_at?:string|null;version?:number};
export type AccessReason="allowed"|"no_entitlement"|"scheduled"|"expired"|"suspended"|"canceled"|"superseded"|"capability_not_included"|"limit_reached"|"evaluation_failed";
export type CapabilityAccessResult={allowed:boolean;capability:CapabilityCode;entitlementCode:EntitlementCode|null;entitlementStatus:EntitlementStatus|null;reason:AccessReason;limit:number|null;currentUsage:number|null};
export function effectiveStatus(row:EntitlementRecord,at=new Date()):EntitlementStatus{
 if(["suspended","canceled","superseded"].includes(row.status))return row.status as EntitlementStatus;
 const now=at.getTime(),start=new Date(row.starts_at).getTime(),end=row.ends_at?new Date(row.ends_at).getTime():null,grace=row.grace_period_ends_at?new Date(row.grace_period_ends_at).getTime():null;
 if(Number.isNaN(start)||now<start)return"scheduled";if(end!==null&&now>=end)return grace!==null&&now<grace?"grace_period":"expired";return row.status==="grace_period"?"grace_period":"active";
}
export function evaluateCapability(row:EntitlementRecord|null,capability:CapabilityCode,at=new Date(),usage:number|null=null):CapabilityAccessResult{
 if(!row)return{allowed:false,capability,entitlementCode:null,entitlementStatus:null,reason:"no_entitlement",limit:null,currentUsage:usage};
 const status=effectiveStatus(row,at),code=isEntitlementCode(row.entitlement_key)?row.entitlement_key:null;
 if(!code)return{allowed:false,capability,entitlementCode:null,entitlementStatus:status,reason:"evaluation_failed",limit:null,currentUsage:usage};
 if(status!=="active"&&status!=="grace_period")return{allowed:false,capability,entitlementCode:code,entitlementStatus:status,reason:status,limit:null,currentUsage:usage};
 const definition=entitlementCatalog[code],included=definition.capabilities.includes(capability),rawLimit=definition.limits[capability],limit=typeof rawLimit==="number"?rawLimit:null;
 if(!included)return{allowed:false,capability,entitlementCode:code,entitlementStatus:status,reason:"capability_not_included",limit,currentUsage:usage};
 if(limit!==null&&usage!==null&&usage>=limit)return{allowed:false,capability,entitlementCode:code,entitlementStatus:status,reason:"limit_reached",limit,currentUsage:usage};
 return{allowed:true,capability,entitlementCode:code,entitlementStatus:status,reason:"allowed",limit,currentUsage:usage};
}
const transitions:Record<EntitlementStatus,readonly EntitlementStatus[]>={scheduled:["active","canceled","superseded"],active:["grace_period","suspended","canceled","superseded"],grace_period:["active","expired","suspended","canceled","superseded"],expired:["active","superseded"],suspended:["active","canceled","superseded"],canceled:["superseded"],superseded:[]};
export function canTransitionEntitlement(from:EntitlementStatus,to:EntitlementStatus){return transitions[from].includes(to);}
