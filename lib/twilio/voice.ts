import {getSupabaseAdmin} from "../supabaseAdmin.ts";
import {resolveTenantOutboundSender} from "./tenantOutboundSender.ts";

export const normalizeVoicePhone=(value:string)=>{const digits=value.replace(/\D/g,"");return digits.length===10?`+1${digits}`:digits.length===11&&digits.startsWith("1")?`+${digits}`:/^\+[1-9]\d{7,14}$/.test(value)?value:null;};
const xml=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"}[char]!));
export type VoiceTarget={employeeId:string;phone:string};

/**
 * answerOnBridge keeps the caller in ordinary ringback until a staff leg is
 * connected. Twilio Number AMD rejects detected machines before bridge; AMD is
 * heuristic, so a short timeout is deliberately preferred over carrier voicemail.
 */
export function inboundVoiceTwiml(input:{callId:string;businessId:string;targets:VoiceTarget[];timeout:number;record:boolean;origin:string}){
 const callback=`${input.origin}/api/twilio/voice/status`;
 const action=`${callback}?parent=${encodeURIComponent(input.callId)}&business=${encodeURIComponent(input.businessId)}`;
 const numbers=input.targets.map(target=>`<Number statusCallback="${xml(callback)}" statusCallbackEvent="initiated ringing answered completed" machineDetection="Enable" machineDetectionTimeout="5" amdStatusCallback="${xml(callback)}" url="${xml(`${callback}?parent=${encodeURIComponent(input.callId)}&employee=${encodeURIComponent(target.employeeId)}&business=${encodeURIComponent(input.businessId)}`)}">${xml(target.phone)}</Number>`).join("");
 return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial answerOnBridge="true" timeout="${input.timeout}" action="${xml(action)}" method="POST"${input.record?` record="record-from-answer-dual" recordingStatusCallback="${xml(`${callback}?recording=1&parent=${encodeURIComponent(input.callId)}&business=${encodeURIComponent(input.businessId)}`)}"`:""}>${numbers}</Dial></Response>`;
}

export async function createOutboundVoiceCall(input:{businessId:string;customerId:string;to:string;employeeId:string;origin:string}){
 const sender=await resolveTenantOutboundSender(input.businessId);if(!sender.configured||!sender.accountSid||!sender.username||!sender.password||!sender.from)throw new Error("A live business Twilio number is required before placing a call.");
 const db=getSupabaseAdmin();if(!db)throw new Error("Voice storage is unavailable.");
 const {data:staff}=await db.from("voice_call_staff").select("phone_e164").eq("business_id",input.businessId).eq("employee_id",input.employeeId).eq("enabled",true).maybeSingle();
 if(!staff?.phone_e164)throw new Error("Your staff phone is not enabled for calling.");
 const voiceUrl=`${input.origin.replace(/\/$/,"")}/api/twilio/voice/outbound?business=${encodeURIComponent(input.businessId)}&customer=${encodeURIComponent(input.customerId)}&to=${encodeURIComponent(input.to)}&from=${encodeURIComponent(sender.from)}`;
 const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sender.accountSid}/Calls.json`,{method:"POST",headers:{Authorization:`Basic ${Buffer.from(`${sender.username}:${sender.password}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({To:staff.phone_e164,From:sender.from,Url:voiceUrl,Method:"POST",StatusCallback:`${input.origin.replace(/\/$/,"")}/api/twilio/voice/status`,StatusCallbackEvent:"initiated ringing answered completed"})});
 const result=await response.json().catch(()=>({})) as {sid?:string;message?:string};if(!response.ok||!result.sid)throw new Error(result.message||"Twilio could not start the call.");
 await db.from("voice_calls").upsert({business_id:input.businessId,customer_id:input.customerId,twilio_call_sid:result.sid,direction:"outbound",status:"initiated",from_number:sender.from,to_number:input.to,metadata:{staff_employee_id:input.employeeId}},{onConflict:"twilio_call_sid"});
 return result.sid;
}
