export const capabilityCodes=["business_onboarding","team_management","employee_import","employee_invitations","customer_management","customer_migration","schedule_management","dispatch","job_management","territory_management","estimates","invoices","online_booking","reporting","inventory","advanced_workforce_intelligence","scenario_planning"] as const;
export type CapabilityCode=(typeof capabilityCodes)[number];
export const entitlementCodes=["pilot","starter","growth","business","enterprise"] as const;
export type EntitlementCode=(typeof entitlementCodes)[number];
export type EntitlementDefinition={code:EntitlementCode;name:string;description:string;capabilities:readonly CapabilityCode[];limits:Readonly<Record<string,number|boolean|null>>;isPubliclySelectable:boolean;isBillingEnabled:boolean};
const pilotCapabilities=[...capabilityCodes] as const;
export const entitlementCatalog:Readonly<Record<EntitlementCode,EntitlementDefinition>>={
 pilot:{code:"pilot",name:"Pilot Access",description:"Full pilot access with no payment method required.",capabilities:pilotCapabilities,limits:{},isPubliclySelectable:false,isBillingEnabled:false},
 starter:{code:"starter",name:"Starter",description:"Future plan definition. Billing and selection are not enabled.",capabilities:[],limits:{},isPubliclySelectable:false,isBillingEnabled:false},
 growth:{code:"growth",name:"Growth",description:"Future plan definition. Billing and selection are not enabled.",capabilities:[],limits:{},isPubliclySelectable:false,isBillingEnabled:false},
 business:{code:"business",name:"Business",description:"Future plan definition. Billing and selection are not enabled.",capabilities:[],limits:{},isPubliclySelectable:false,isBillingEnabled:false},
 enterprise:{code:"enterprise",name:"Enterprise",description:"Future plan definition. Billing and selection are not enabled.",capabilities:[],limits:{},isPubliclySelectable:false,isBillingEnabled:false},
};
export function isCapabilityCode(value:string):value is CapabilityCode{return(capabilityCodes as readonly string[]).includes(value);}
export function isEntitlementCode(value:string):value is EntitlementCode{return(entitlementCodes as readonly string[]).includes(value);}
