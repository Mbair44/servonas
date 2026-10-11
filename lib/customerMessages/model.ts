export type CustomerMessage = {
 id:string; business_id:string; customer_id:string|null; counterparty_phone_e164:string;
 direction:"inbound"|"outbound"; body:string; status:string; source_type:string;
 read_at:string|null; created_at:string; sent_at:string|null; received_at:string|null;
 provider_message_id:string|null;
};
export type Contact = {id:string;first_name:string|null;last_name:string|null;company_name:string|null};
export const normalizePhone=(phone:string)=>{const digits=phone.replace(/\D/g,"");return digits.length===10?`+1${digits}`:`+${digits}`;};
export const messageTime=(message:CustomerMessage)=>message.sent_at??message.received_at??message.created_at;
export function conversations(messages:CustomerMessage[], customers:Contact[]=[]){
 const owners=new Map<string,Set<string>>();
 for(const m of messages)if(m.customer_id){const phone=normalizePhone(m.counterparty_phone_e164);const ids=owners.get(phone)??new Set<string>();ids.add(m.customer_id);owners.set(phone,ids);}
 const groups=new Map<string,CustomerMessage[]>();
 for(const m of messages){const phone=normalizePhone(m.counterparty_phone_e164),ids=owners.get(phone);const customerId=m.customer_id??(ids?.size===1?[...ids][0]:null);const key=customerId?`customer:${customerId}`:`phone:${phone}`;groups.set(key,[...(groups.get(key)??[]),m]);}
 return [...groups].map(([key,rows])=>{rows.sort((a,b)=>messageTime(a).localeCompare(messageTime(b))||a.id.localeCompare(b.id));const latest=rows[rows.length-1],customer=customers.find(c=>key===`customer:${c.id}`);return {key,messages:rows,latest,phone:normalizePhone(latest.counterparty_phone_e164),name:customer?.company_name||[customer?.first_name,customer?.last_name].filter(Boolean).join(" ")||normalizePhone(latest.counterparty_phone_e164),unread:rows.filter(m=>m.direction==="inbound"&&!m.read_at).length};}).sort((a,b)=>messageTime(b.latest).localeCompare(messageTime(a.latest)));
}
