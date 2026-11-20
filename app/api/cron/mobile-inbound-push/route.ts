import {NextResponse} from "next/server";
import {randomUUID} from "node:crypto";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {isAuthorizedCronRequest} from "@/lib/cronAuth";
import {sendExpoIncomingMessagePush} from "@/lib/mobilePush/expoPush";
export const runtime="nodejs";
const batch=25,maxRetries=5;
const delay=(attempt:number)=>Math.min(3600,(2**Math.min(attempt,8))*30+Math.floor(Math.random()*15));
async function finish(db:NonNullable<ReturnType<typeof getSupabaseAdmin>>,id:string,status:string,extra:Record<string,unknown>={}){return db.from("inbound_message_push_outbox").update({status,lease_owner:null,lease_expires_at:null,updated_at:new Date().toISOString(),...extra}).eq("id",id);}
export async function GET(request:Request){
 if(!isAuthorizedCronRequest(request))return NextResponse.json({error:"Unauthorized"},{status:401});
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const {error:reconcileError}=await db.rpc("reconcile_recent_inbound_message_push_intents",{p_limit:batch});
 if(reconcileError){console.error("Mobile push reconciliation failed",{code:reconcileError.code});return NextResponse.json({error:"Push reconciliation failed"},{status:500});}
 const owner=`mobile-push:${randomUUID()}`;
 const {data:claimed,error}=await db.rpc("claim_inbound_message_push_outbox",{p_limit:batch,p_lease_owner:owner});
 if(error){console.error("Mobile push claim failed",{code:error.code});return NextResponse.json({error:"Push claim failed"},{status:500});}
 let accepted=0,skipped=0,retrying=0,uncertain=0;
 for(const item of claimed??[]){
  const [{data:message},{data:device},{data:business}]=await Promise.all([
   db.from("customer_messages").select("id,business_id,direction").eq("id",item.message_id).eq("business_id",item.business_id).maybeSingle(),
   db.from("mobile_device_registrations").select("id,user_id,expo_push_token,is_active").eq("id",item.device_registration_id).eq("business_id",item.business_id).maybeSingle(),
   db.from("businesses").select("name").eq("id",item.business_id).maybeSingle(),
  ]);
  if(!message||message.direction!=="inbound"||!device?.is_active||!business){await finish(db,item.id,"terminal_failure",{provider_outcome:{reason:"source_or_device_unavailable"}});skipped++;continue;}
  const [{data:employee},{data:membership}]=await Promise.all([
   db.from("employees").select("id,is_active").eq("business_id",item.business_id).eq("auth_user_id",device.user_id).eq("is_active",true).maybeSingle(),
   db.from("business_members").select("role").eq("business_id",item.business_id).eq("user_id",device.user_id).in("role",["owner","admin","manager"]).maybeSingle(),
  ]);
  const {data:pref}=employee?await db.from("employee_mobile_notification_preferences").select("receive_incoming_text_notifications").eq("business_id",item.business_id).eq("employee_id",employee.id).maybeSingle():{data:null};
  if(!employee||!membership||!pref?.receive_incoming_text_notifications){await finish(db,item.id,"terminal_failure",{provider_outcome:{reason:"authorization_revoked"}});skipped++;continue;}
  const result=await sendExpoIncomingMessagePush({token:device.expo_push_token,businessId:item.business_id,messageId:item.message_id,title:business.name});
  if(result.kind==="accepted"){await finish(db,item.id,"delivered",{delivered_at:new Date().toISOString(),provider_outcome:{accepted:true}});accepted++;continue;}
  if(result.kind==="invalid_token"){await db.from("mobile_device_registrations").update({is_active:false,deactivated_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",device.id).eq("business_id",item.business_id);await finish(db,item.id,"terminal_failure",{provider_outcome:{reason:"invalid_token"}});skipped++;continue;}
  if(result.kind==="uncertain"){await finish(db,item.id,"uncertain",{provider_outcome:{reason:"provider_outcome_uncertain"}});uncertain++;continue;}
  const attempts=Number(item.retry_count??0)+1;if(attempts>=maxRetries){await finish(db,item.id,"terminal_failure",{retry_count:attempts,provider_outcome:{reason:"retry_exhausted"}});skipped++;continue;}
  await finish(db,item.id,"retryable_failure",{retry_count:attempts,next_attempt_at:new Date(Date.now()+delay(attempts)*1000).toISOString(),provider_outcome:{reason:"temporary_provider_failure"}});retrying++;
 }
 return NextResponse.json({ok:true,claimed:(claimed??[]).length,accepted,skipped,retrying,uncertain});
}
