import {stripeClient} from './stripeConnect.ts';
import type {BookingTaxProvider} from './bookingTax.ts';

/** Temporary CSB diagnostic. Read-only and deliberately independent of checkout success. */
export async function logInactiveBookingTaxSettings(
 businessId:string,
 accountId:string|null|undefined,
 getClient:typeof stripeClient=stripeClient,
){
 if(businessId!=="cb25acc0-3623-4c06-9041-89a88f4ad6ed"||!accountId)return;
 try{
  const settings=await getClient().tax.settings.retrieve({}, {stripeAccount:accountId,timeout:5000,maxNetworkRetries:0});
  console.info("Checkout Stripe Tax settings diagnostic",{
   operation:"automatic_booking_tax_settings_diagnostic",
   businessId,accountId,
   status:settings.status,
   status_details:settings.status_details,
   missingFields:settings.status_details?.pending?.missing_fields??[],
   head_office:settings.head_office,
   defaults:{tax_code:settings.defaults.tax_code},
   livemode:settings.livemode,
  });
 }catch{
  // Never serialize the SDK error: it can contain request data or credentials.
  console.warn("Checkout Stripe Tax settings diagnostic unavailable",{
   operation:"automatic_booking_tax_settings_diagnostic",businessId,accountId,
  });
 }
}

/** Same connected Stripe Tax provider as invoices, with already-discounted amounts. */
export function bookingTaxProvider(accountId:string|null|undefined,address:{line1:string;city:string;state:string;postal_code:string;country:string},displayMode:'exclusive'|'inclusive',getClient:typeof stripeClient=stripeClient):BookingTaxProvider{
 return async lines=>{
  if(!accountId||!address.line1||!address.city||!address.state||!address.postal_code||!address.country)throw new Error('Automatic tax requires a connected Stripe account and complete delivery address.');
  const stripe=getClient();
  const calculation=await stripe.tax.calculations.create({currency:'usd',line_items:lines.map(line=>({reference:line.id,amount:line.amountCents,tax_behavior:displayMode,...(line.taxCode?{tax_code:line.taxCode}:{})})),customer_details:{address,address_source:'shipping'}},{stripeAccount:accountId});
  // Fetch every result: unexpanded or paginated provider lines must never become zero tax.
  if(!calculation.id)throw new Error('Automatic tax calculation is missing its identifier.');
  const results=[];
  for await(const line of stripe.tax.calculations.listLineItems(calculation.id,{limit:100},{stripeAccount:accountId})){
   if(!line.reference)throw new Error('Automatic tax line is missing its reference.');
   results.push({id:line.reference,taxCents:line.amount_tax,metadata:line});
  }
  const tax=results.reduce((sum,line)=>sum+line.taxCents,0);
  if(tax!==calculation.tax_amount_exclusive+calculation.tax_amount_inclusive)throw new Error('Automatic tax totals did not reconcile.');
  return {calculationId:calculation.id,lines:results,metadata:{tax_breakdown:calculation.tax_breakdown,expires_at:calculation.expires_at,address}};
 };
}
