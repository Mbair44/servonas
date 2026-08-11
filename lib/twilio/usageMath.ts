export type UsageStatus="accepted"|"scheduled"|"queued"|"sending"|"sent"|"delivered"|"undelivered"|"failed"|"received"|"read"|string;
const statusRank:Record<string,number>={accepted:10,scheduled:10,queued:20,sending:30,sent:40,received:50,delivered:60,undelivered:60,failed:60,read:70};
const terminal=new Set(["sent","received","delivered","undelivered","failed","read"]);

export function shouldAdvanceMessageStatus(current:string|null|undefined,next:string|null|undefined){
 const from=(current||"").toLowerCase(),to=(next||"").toLowerCase();
 if(!to)return false;if(!from||from===to)return true;
 if(terminal.has(from)&&terminal.has(to))return statusRank[to]>statusRank[from];
 return (statusRank[to]??0)>=(statusRank[from]??0);
}

export function usageCanFinalize(input:{status:string;numSegments:number|null;numMedia:number|null;price:number|null;priceUnit:string|null}){
 const status=input.status.toLowerCase();
 return terminal.has(status)&&input.numSegments!==null&&input.numSegments>0&&input.numMedia!==null&&input.numMedia>=0&&input.price!==null&&Boolean(input.priceUnit?.trim());
}

export function utcBillingPeriod(value:string|Date){const date=new Date(value);return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-01`;}
export function nextMonth(periodStart:string){const date=new Date(`${periodStart}T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()+1);return date.toISOString().slice(0,10);}

export type BillableUsage={direction:string;channel:string;num_segments:number|null;usage_finalized_at:string|null;twilio_price:number|string|null;twilio_price_unit:string|null};
export function calculateMessagingPeriod(rows:BillableUsage[],includedUnits:number){
 const finalized=rows.filter(row=>row.usage_finalized_at),billableUnits=finalized.reduce((sum,row)=>sum+(row.direction.startsWith("outbound")&&row.channel==="sms"?Math.max(0,Number(row.num_segments??0)):0),0);
 const currencies=new Set(finalized.map(row=>row.twilio_price_unit?.toUpperCase()).filter((value):value is string=>Boolean(value)));
 const providerCost=finalized.reduce((sum,row)=>sum+Math.abs(Number(row.twilio_price??0)),0);
 return{includedUnits:Math.max(0,includedUnits),billableUnits,overageUnits:Math.max(0,billableUnits-Math.max(0,includedUnits)),providerCost,providerCostCurrency:currencies.size===1?[...currencies][0]:currencies.size?"MULTI":null,unfinalizedMessageCount:rows.length-finalized.length};
}
