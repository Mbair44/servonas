const day=/^\d{4}-\d{2}-\d{2}$/;
const utcDay=(value:string)=>new Date(`${value}T00:00:00Z`);
export function adSpendSyncRange(input:{dateFrom?:string;dateThrough?:string;fallbackDays:number;today?:Date}){
 const hasCustom=input.dateFrom!=null||input.dateThrough!=null;
 if(hasCustom){
  if(!input.dateFrom||!input.dateThrough||!day.test(input.dateFrom)||!day.test(input.dateThrough))throw new Error("A backfill requires ISO date_from and date_through values.");
  const from=utcDay(input.dateFrom),through=utcDay(input.dateThrough),today=utcDay((input.today??new Date()).toISOString().slice(0,10));
  if(Number.isNaN(from.valueOf())||Number.isNaN(through.valueOf())||from>through||through>today)throw new Error("Backfill dates must be valid and cannot be in the future.");
  if((through.valueOf()-from.valueOf())/86400000+1>14)throw new Error("Backfill ranges are limited to 14 days.");
  return {from:input.dateFrom,to:input.dateThrough};
 }
 const now=input.today??new Date(),to=now.toISOString().slice(0,10),from=new Date(now.getTime()-input.fallbackDays*86400000).toISOString().slice(0,10);
 return {from,to};
}
