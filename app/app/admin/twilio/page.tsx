import {randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";
import {smsTestBusiness,smsTestLiveEnabled} from "@/lib/twilio/testSms";
import {verifyTenantReadiness} from "@/lib/twilio/liveReadiness";
import {sendTestSms} from "./testActions";
import TemporaryDiagnostic from "./TemporaryDiagnostic";
import TemporaryCopperStateBounceRelink from "./TemporaryCopperStateBounceRelink";
export const dynamic="force-dynamic";
export default async function TwilioAdmin({searchParams}:{searchParams:Promise<{error?:string;diagnostic?:string;relink?:string}>}){
 const session=await createSupabaseServerClient(),{data:{user}}=await session.auth.getUser();
 if(!user)redirect("/login?next=/app/admin/twilio");if(!isServonasPlatformAdmin(user))redirect("/app");
 let business;try{business=await smsTestBusiness();}catch(error){return <main className="workspace-panel"><h1>Twilio SMS test</h1><p>{error instanceof Error?error.message:"Configuration unavailable."}</p></main>;}
 const readiness=await verifyTenantReadiness(business.id),db=getSupabaseAdmin()!,query=await searchParams;
 const [attempts,usage,inbound]=await Promise.all([
  db.from("twilio_tenant_activation_events").select("id,to_status,metadata,occurred_at").eq("business_id",business.id).eq("event_type","sms_test").order("occurred_at",{ascending:false}).limit(10),
  db.from("twilio_message_usage").select("twilio_message_sid,message_status,provider_error_code,provider_error_message,last_status_callback_at,source_id").eq("business_id",business.id).eq("source_type","sms_test").order("created_at",{ascending:false}).limit(30),
  db.from("inbound_sms_messages").select("provider_message_id,from_phone_e164,body,received_at").eq("business_id",business.id).order("received_at",{ascending:false}).limit(10)
 ]);
 const storageError=attempts.error||usage.error||inbound.error;
 return <main className="workspace-panel"><Link href="/admin">← Administration</Link><h1>{business.name} · SMS test</h1><p><strong>{readiness.state}</strong> · Verified {readiness.checkedAt}</p>
 <ul>{readiness.issues.map(issue=><li key={issue}>{issue}</li>)}</ul><p><Link href="/app/admin/twilio" prefetch={false}>Refresh readiness, delivery status and replies</Link></p>
 <dl>{Object.entries(readiness.resources).map(([name,r])=><div key={name}><dt>{name}</dt><dd>{r.sid} · {r.status}</dd></div>)}</dl>
 {query.error&&<p role="alert">{query.error}</p>}{storageError&&<p role="alert">Test history is unavailable. Check the SMS pilot migration.</p>}
 {!smsTestLiveEnabled()&&<p>Live pilot sending is disabled for this environment.</p>}
 <form action={sendTestSms}><input type="hidden" name="requestKey" value={randomUUID()}/><fieldset disabled={readiness.state!=="ready"||!smsTestLiveEnabled()||Boolean(storageError)}><legend>Send one real test SMS</legend><label>Destination <input name="to" type="tel" placeholder="+14805550123" pattern="\+1[2-9][0-9]{9}" required/></label><p>The message identifies {business.name}, asks for a reply, and includes STOP instructions.</p><label><input type="checkbox" name="consent" required/> This recipient agreed to this test SMS and any Twilio charges.</label><p><button className="sv-button">Send test SMS</button></p></fieldset></form>
 {/* TEMPORARY: remove after Copper State Bounce resource linkage is complete. */}
 {business.id==="cb25acc0-3623-4c06-9041-89a88f4ad6ed"&&<TemporaryDiagnostic run={query.diagnostic==="1"}/>} 
 {business.id==="cb25acc0-3623-4c06-9041-89a88f4ad6ed"&&<TemporaryCopperStateBounceRelink outcome={query.relink}/>} 
 <h2>Test history</h2><p>“Accepted” means Twilio accepted the API request. Look for a delivery callback below. Unknown/sending outcomes must be checked in Twilio before resending.</p>
 {(attempts.data??[]).map(attempt=>{const m=attempt.metadata as {to?:string;messageSid?:string;error?:string;errorCode?:string},record=usage.data?.find(r=>r.twilio_message_sid===m.messageSid||r.source_id===String(attempt.id));return <article key={attempt.id}><p>{attempt.occurred_at} · {m.to} · <strong>{record?.message_status??attempt.to_status}</strong></p><p>SID: {record?.twilio_message_sid??m.messageSid??"Not recorded"}</p><p>Delivery callback: {record?.last_status_callback_at??"Not observed"}</p>{(m.error||record?.provider_error_code)&&<p role="status">{record?.provider_error_code??m.errorCode} {record?.provider_error_message??m.error}</p>}</article>;})}
 <h2>Recent inbound replies</h2><Link href={`/app/${business.slug}/customers/messages`}>Open customer SMS inbox</Link>{(inbound.data??[]).map(m=><article key={m.provider_message_id}><p>{m.received_at} · {m.from_phone_e164} · {m.provider_message_id}</p><p>{m.body}</p></article>)}
 </main>;
}
