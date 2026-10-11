import {NextResponse} from "next/server";
import {requireWorkspace} from "@/lib/workspace";
import {getSubaccountWebhookSecretResolver} from "@/lib/twilio/subaccountWebhookSecrets";

export const runtime="nodejs";

/** Streams a tenant-owned Twilio voicemail without exposing a recording URL or credentials to the browser. */
export async function GET(_request:Request,{params}:{params:Promise<{businessSlug:string;callId:string}>}){
 const {businessSlug,callId}=await params;
 const {supabase,business}=await requireWorkspace(businessSlug);
 try{
  const {data:call}=await supabase.from("voice_calls").select("recording_sid").eq("id",callId).eq("business_id",business.id).maybeSingle();
  if(!call?.recording_sid)return NextResponse.json({error:"Voicemail recording not found."},{status:404});
  const {data:account}=await supabase.from("business_twilio_accounts").select("twilio_subaccount_sid").eq("business_id",business.id).eq("provisioning_status","active").maybeSingle();
  const accountSid=account?.twilio_subaccount_sid,token=accountSid?await getSubaccountWebhookSecretResolver().getSubaccountAuthToken({businessId:business.id,subaccountSid:accountSid}):null;
  if(!accountSid||!token)return NextResponse.json({error:"Voicemail playback is unavailable."},{status:503});
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Recordings/${encodeURIComponent(call.recording_sid)}.mp3`,{headers:{Authorization:`Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}`},cache:"no-store"});
  if(!response.ok||!response.body){console.error("Twilio voicemail recording fetch failed",{businessId:business.id,callId,status:response.status});return NextResponse.json({error:"Voicemail playback is unavailable."},{status:502});}
  return new Response(response.body,{status:200,headers:{"Content-Type":response.headers.get("content-type")||"audio/mpeg","Cache-Control":"private, no-store","Content-Disposition":"inline; filename=voicemail.mp3"}});
 }catch(error){console.error("Twilio voicemail recording access failed",{callId,error:error instanceof Error?error.message:"unknown"});return NextResponse.json({error:"Voicemail playback is unavailable."},{status:500});}
}
