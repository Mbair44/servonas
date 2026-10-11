export type CampaignSpendFact={campaign_id:string|null;spend_amount:number|string|null;currency:string|null};

/** Returns null for a campaign whose facts are missing or unsafe to display as USD. */
export function googleCampaignSpendCents(rows:CampaignSpendFact[]){
 const totals=new Map<string,number|null>();
 for(const row of rows){
  const id=String(row.campaign_id??"").trim(),currency=String(row.currency??"").trim().toUpperCase();
  if(!id)continue;
  if(currency!=="USD"){totals.set(id,null);continue;}
  if(totals.get(id)===null)continue;
  totals.set(id,(totals.get(id)??0)+Math.max(0,Math.round(Number(row.spend_amount??0)*100)));
 }
 return totals;
}

export function campaignEconomics(input:{spendCents:number|null;visits:number;bookingStarts:number;bookings:number;revenueCents:number}){
 const divide=(denominator:number)=>input.spendCents==null||denominator<=0?null:Math.round(input.spendCents/denominator);
 return {costPerVisitCents:divide(input.visits),costPerBookingStartCents:divide(input.bookingStarts),costPerBookingCents:divide(input.bookings),roas:input.spendCents==null||input.spendCents<=0?null:input.revenueCents/input.spendCents};
}
