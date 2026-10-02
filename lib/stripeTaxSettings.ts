import {stripeClient,stripeProviderError} from "./stripeConnect.ts";

export type StripeTaxBusinessAddress={address_line1?:string|null;address_line2?:string|null;city?:string|null;state?:string|null;postal_code?:string|null;country?:string|null};
export type StripeTaxSettingsDiagnostic={accountId:string;status:string|null;missingFields:string[];headOfficeState:string|null;headOfficePostalCode:string|null;livemode:boolean|null};

export class StripeTaxSettingsSyncError extends Error{
 readonly code:"missing_connected_account"|"incomplete_business_address"|"provider_error";
 constructor(code:"missing_connected_account"|"incomplete_business_address"|"provider_error",message:string){super(message);this.name="StripeTaxSettingsSyncError";this.code=code;}
}

const value=(input:string|null|undefined)=>input?.trim()||null;

export function stripeTaxHeadOfficeAddress(business:StripeTaxBusinessAddress){
 const line1=value(business.address_line1),city=value(business.city),state=value(business.state),postalCode=value(business.postal_code),country=(value(business.country)||"US").toUpperCase();
 if(!line1||!city||!state||!postalCode)throw new StripeTaxSettingsSyncError("incomplete_business_address","Save a complete business address (street, city, state, and postal code) before syncing Stripe Tax.");
 return {line1,...(value(business.address_line2)?{line2:value(business.address_line2)!}:{}),city,state,postal_code:postalCode,country};
}

export async function syncConnectedStripeTaxSettings(input:{businessId:string;accountId:string|null|undefined;business:StripeTaxBusinessAddress;stripe?:ReturnType<typeof stripeClient>}):Promise<StripeTaxSettingsDiagnostic>{
 if(!input.accountId)throw new StripeTaxSettingsSyncError("missing_connected_account","Connect Stripe before syncing Stripe Tax settings.");
 const address=stripeTaxHeadOfficeAddress(input.business),stripe=input.stripe??stripeClient();
 try{
  await stripe.tax.settings.update({head_office:{address}}, {stripeAccount:input.accountId});
  const settings=await stripe.tax.settings.retrieve({}, {stripeAccount:input.accountId});
  const diagnostic={accountId:input.accountId,status:settings.status??null,missingFields:settings.status_details?.pending?.missing_fields??[],headOfficeState:settings.head_office?.address?.state??null,headOfficePostalCode:settings.head_office?.address?.postal_code??null,livemode:settings.livemode??null};
  console.info("Stripe Tax settings synchronized",{businessId:input.businessId,...diagnostic});
  return diagnostic;
 }catch(error){
  if(error instanceof StripeTaxSettingsSyncError)throw error;
  const detail=stripeProviderError(error);
  console.error("Stripe Tax settings synchronization failed",{businessId:input.businessId,accountId:input.accountId,errorType:detail.type,errorCode:detail.code,errorMessage:detail.message,operation:"connected_tax_settings_sync"});
  throw new StripeTaxSettingsSyncError("provider_error","Stripe Tax settings could not be synchronized. Your business address was saved; try Sync Stripe Tax settings again.");
 }
}
