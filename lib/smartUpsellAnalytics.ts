type Offer={status:string;created_at:string;sent_at?:string|null;viewed_at?:string|null;checkout_started_at?:string|null;accepted_at?:string|null;discounted_price_cents:number;additional_delivery_fee_cents:number;deposit_cents:number;remaining_balance_increment_cents:number};
type Period={from?:string;to?:string};
export const smartUpsellRate=(numerator:number,denominator:number)=>denominator>0?numerator/denominator:null;
const inPeriod=(value:string|null|undefined,period:Period)=>Boolean(value)&&(!period.from||new Date(value!).getTime()>=new Date(period.from).getTime())&&(!period.to||new Date(value!).getTime()<new Date(period.to).getTime());
/** Revenue is recognized only when the accepted offer was reconciled into its existing booking. */
export function summarizeSmartUpsells(offers:Offer[],period:Period={}){
 const sent=offers.filter(row=>inPeriod(row.sent_at,period)).length,views=offers.filter(row=>inPeriod(row.viewed_at,period)).length,checkoutStarts=offers.filter(row=>inPeriod(row.checkout_started_at,period)).length,accepted=offers.filter(row=>row.status==="accepted"&&inPeriod(row.accepted_at,period)),eligible=offers.filter(row=>inPeriod(row.created_at,period)).length;
 const bookedRevenue=accepted.reduce((sum,row)=>sum+Number(row.discounted_price_cents??0)+Number(row.additional_delivery_fee_cents??0),0),deposits=accepted.reduce((sum,row)=>sum+Number(row.deposit_cents??0),0),remaining=accepted.reduce((sum,row)=>sum+Number(row.remaining_balance_increment_cents??0),0);
 return{eligibleBookings:eligible,offersSent:sent,offerViews:views,checkoutStarts,acceptedOffers:accepted.length,conversionRate:smartUpsellRate(accepted.length,sent),bookedRevenueCents:bookedRevenue,depositsCollectedCents:deposits,remainingBalanceCents:remaining};
}
/** Rolling reporting period. Displayed dates use the tenant timezone; persisted timestamps remain UTC. */
export function smartUpsellRange(input:{range?:string;timezone:string;now?:Date}){const days=input.range==="90d"?90:input.range==="7d"?7:30,now=input.now??new Date(),from=new Date(now.getTime()-days*86_400_000);return{from:from.toISOString(),to:now.toISOString(),label:`Last ${days} days`,timezone:input.timezone};}
