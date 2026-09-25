import type {AdPlatformStatusSummary} from "./adPlatform.ts";

export const paidEconomicsHelp={
 roas:"Attributed revenue divided by ad spend for the selected dates. A ROAS of 1.33x means $1.33 in attributed revenue for every $1.00 spent.",
 costPerBooking:"Ad spend divided by attributed bookings for the selected dates.",
 totalRoas:"Revenue attributed to paid advertising divided by total paid ad spend. Only Google Ads and Meta Ads revenue is included; Organic Social and Meta — unspecified revenue is excluded.",
 totalCostPerBooking:"Total paid ad spend divided by bookings attributed to Google Ads and Meta Ads for the selected dates.",
};
type SpendStatus=Pick<AdPlatformStatusSummary,"provider"|"state"|"spendCents"|"lastSyncError"|"spendAvailable">;
export function availablePaidSpend(status:SpendStatus|undefined):number|null{
 if(!status||status.spendAvailable===false||status.lastSyncError||!["connected_with_data","connected_synced_no_data"].includes(status.state))return null;
 return Number.isFinite(status.spendCents)&&status.spendCents>=0?status.spendCents:null;
}
export function paidEconomics(spendCents:number|null,revenueCents:number,bookings:number){
 return {spendCents,roas:spendCents!=null&&spendCents>0?revenueCents/spendCents:null,costPerBookingCents:spendCents!=null&&bookings>0?spendCents/bookings:null};
}
export function sourcePaidEconomics(source:string,revenueCents:number,bookings:number,statuses:SpendStatus[]){
 const provider=source==="google_ads"?"google_ads":source==="meta_ads"?"meta":null;
 return paidEconomics(provider?availablePaidSpend(statuses.find(status=>status.provider===provider)):null,revenueCents,bookings);
}
/** A partial spend sum must not be presented as the total for both platforms. */
export function totalPaidEconomics(rows:Array<{source:string;revenueCents:number;bookings:number}>,statuses:SpendStatus[]){
 const paid=rows.filter(row=>["google_ads","meta_ads"].includes(row.source));
 const spend=["google_ads","meta"].map(provider=>availablePaidSpend(statuses.find(status=>status.provider===provider)));
 const revenueCents=paid.reduce((sum,row)=>sum+row.revenueCents,0),bookings=paid.reduce((sum,row)=>sum+row.bookings,0);
 return {...paidEconomics(spend.every(value=>value!==null)?spend.reduce<number>((sum,value)=>sum+(value??0),0):null,revenueCents,bookings),revenueCents,bookings};
}
export const formatPaidRoas=(value:number|null)=>value===null?"—":`${value.toFixed(2)}x`;
