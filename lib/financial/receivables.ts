export type ReceivableStatus="scheduled"|"due"|"processing"|"paid"|"failed"|"past_due";
export type ReceivableRow={id:string;source:"booking"|"invoice";customer:string;customerId:string|null;reference:string;jobId:string|null;eventDate:string|null;totalCents:number;paidCents:number;remainingCents:number;scheduledFor:string|null;paymentMethod:string|null;status:ReceivableStatus;failureMessage:string|null};

const day=(value:string|null)=>value?.slice(0,10)??null;
export function receivableStatus(input:{remainingCents:number;scheduledFor:string|null;paymentStatus?:string|null;invoiceStatus?:string|null},today=new Date().toISOString().slice(0,10)):ReceivableStatus{
 if(input.remainingCents<=0||input.invoiceStatus==="paid")return "paid";
 if(["pending","processing","requires_action"].includes(input.paymentStatus??""))return "processing";
 if(input.paymentStatus==="failed")return "failed";
 const scheduled=day(input.scheduledFor);
 if(scheduled&&scheduled<today)return "past_due";
 if(scheduled&&scheduled>today)return "scheduled";
 return "due";
}
export function receivableSummary(rows:ReceivableRow[],today=new Date().toISOString().slice(0,10)){
 const start=new Date(`${today}T00:00:00Z`),inDays=(value:string|null,days:number)=>{if(!value)return false;const when=new Date(`${value.slice(0,10)}T00:00:00Z`);return when>=start&&when<=new Date(start.getTime()+days*86400000)};
 const open=rows.filter(row=>row.remainingCents>0);
 return{outstanding:open.reduce((sum,row)=>sum+row.remainingCents,0),next7:open.filter(row=>inDays(row.scheduledFor,7)).reduce((sum,row)=>sum+row.remainingCents,0),next30:open.filter(row=>inDays(row.scheduledFor,30)).reduce((sum,row)=>sum+row.remainingCents,0),pastDue:open.filter(row=>row.status==="past_due"||row.status==="failed").reduce((sum,row)=>sum+row.remainingCents,0)};
}
