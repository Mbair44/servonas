import type {BusinessTaxSettings} from './financial/tax.ts';

export type BookingTaxLine={id:string;amountCents:number;taxable:boolean;taxCode?:string|null};
export type BookingTaxProvider=(lines:BookingTaxLine[])=>Promise<{calculationId:string;lines:Array<{id:string;taxCents:number;metadata?:unknown}>;metadata?:unknown}>;

/** New quotes only. Allocate discounts before asking the provider; never reprice saved bookings. */
export async function calculateBookingTax(input:{lines:BookingTaxLine[];discountCents:number;discountIncludesDelivery?:boolean;delivery:BookingTaxLine;settings:BusinessTaxSettings;exempt:boolean;depositPercent:number},provider:BookingTaxProvider){
 const {settings}=input;
 const cents=(n:number)=>{if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid booking amount.');return n;};
 const subtotalCents=input.lines.reduce((sum,line)=>sum+cents(line.amountCents),0);
 const deliveryAmountCents=cents(input.delivery.amountCents);
 const discountBaseCents=subtotalCents+(input.discountIncludesDelivery?deliveryAmountCents:0);
 const discountCents=Math.min(discountBaseCents,cents(input.discountCents));
 // Cumulative allocation preserves every cent and is deterministic across mixed eligibility.
 let cumulative=0,allocated=0;
 const allocatableLines=[...input.lines,{...input.delivery,amountCents:deliveryAmountCents}];
 const lines=allocatableLines.map(line=>{const eligibleForOrderDiscount=line.id!==input.delivery.id||Boolean(input.discountIncludesDelivery);cumulative+=eligibleForOrderDiscount?line.amountCents:0;const next=discountBaseCents?Math.round(discountCents*cumulative/discountBaseCents):0,discount=next-allocated;allocated=next;return {...line,discountCents:discount,amountCents:line.amountCents-discount};});
 const taxable=lines.filter(line=>settings.taxEnabled&&!input.exempt&&line.taxable&&line.amountCents>0);
 let result:Awaited<ReturnType<BookingTaxProvider>>|null=null;
 if(settings.calculationMethod==='automatic'&&taxable.length)result=await provider(taxable);
 const snapshots=lines.map(line=>{
  let taxCents=0;const eligible=taxable.some(row=>row.id===line.id);
  if(eligible&&settings.calculationMethod==='automatic'){
   const matches=result?.lines.filter(row=>row.id===line.id)??[];
   if(!result?.calculationId||matches.length!==1)throw new Error('Automatic tax response is incomplete.');
   taxCents=cents(matches[0].taxCents);
  }else if(eligible){
   const rate=cents(settings.manualTaxRateBasisPoints);if(rate>10000)throw new Error('Invalid tax rate.');
   taxCents=Math.round(line.amountCents*rate/(settings.displayMode==='inclusive'?10000+rate:10000));
  }
  return {...line,taxCents,taxableBasisCents:eligible?line.amountCents:0,providerDetails:result?.lines.find(row=>row.id===line.id)?.metadata??null};
 });
 const taxCents=snapshots.reduce((sum,line)=>sum+line.taxCents,0),taxableSubtotalCents=snapshots.reduce((sum,line)=>sum+line.taxableBasisCents,0);
 const totalCents=subtotalCents+deliveryAmountCents-discountCents+(settings.displayMode==='inclusive'?0:taxCents);
 const depositCents=Math.round(totalCents*Math.max(0,Math.min(100,input.depositPercent))/100);
 return {subtotalCents,discountCents,deliveryFeeCents:deliveryAmountCents,taxableSubtotalCents,taxCents,totalCents,depositCents,remainingBalanceCents:totalCents-depositCents,snapshot:{version:1,settings:{...settings},customerExempt:input.exempt,calculatedAt:new Date().toISOString(),calculationId:result?.calculationId??null,providerMetadata:result?.metadata??null,lines:snapshots}};
}
