import {requireWorkspace} from "@/lib/workspace";
import {loadInbox} from "@/lib/customerMessages/service";
import {WorkspaceNav} from "../../WorkspaceNav";
import {MessagesInbox} from "./MessagesInbox";
import {normalizePhone} from "@/lib/customerMessages/model";
export default async function CustomerMessages({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,query=await searchParams,{supabase,business}=await requireWorkspace(businessSlug);
 // loadInbox retains provider_message_id for canonical delivery evidence.
 const inbox=await loadInbox(supabase,business.id);
 const requestedCustomerId=query.customerId?.trim(),requestedPhone=query.phone?.trim(),phone=requestedPhone?normalizePhone(requestedPhone):"";
 const initialTarget=requestedCustomerId&&/^\+[1-9]\d{7,14}$/.test(phone)?await (async()=>{const {data:customer}=await supabase.from("customers").select("id,first_name,last_name,company_name,phone,secondary_phone,phone_normalized").eq("business_id",business.id).eq("id",requestedCustomerId).eq("is_deleted",false).maybeSingle();const phones=[customer?.phone,customer?.secondary_phone,customer?.phone_normalized].filter((value):value is string=>Boolean(value)).map(normalizePhone);if(!customer||!phones.includes(phone))return null;return{key:`customer:${customer.id}`,customerId:customer.id,phone,name:customer.company_name||[customer.first_name,customer.last_name].filter(Boolean).join(" ")||phone};})():null;
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><header className="epic3-header"><div><small>Messages</small><h1>Message inbox</h1><p>Customer texts and replies. Updates every 10 seconds.</p></div></header><MessagesInbox slug={businessSlug} initial={inbox} timezone={business.timezone||"America/Phoenix"} initialTarget={initialTarget}/></section></main>;
}
