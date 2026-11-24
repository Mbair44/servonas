import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { EARLY_ACCESS_CONSENT_VERSION, parseEarlyAccessLead } from "@/lib/earlyAccess";

const recipient="mbair@servonas.com";
const clientIp=(request:Request)=>request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||request.headers.get("x-real-ip")||"unknown";
const safe=(value:unknown,max=120)=>typeof value==="string"?value.trim().slice(0,max):"";

async function sendEarlyAccessEmails(lead:{business_name:string;contact_name:string;email:string;phone:string|null;business_city:string|null;business_state:string|null;current_software:string;inventory_size:string|null;biggest_challenge:string|null},source:string|null){
 const apiKey=process.env.RESEND_API_KEY?.trim(),from=process.env.EMAIL_FROM?.trim();
 if(!apiKey||!from){console.error("Early access notification is not configured",{missing:[!apiKey?"RESEND_API_KEY":null,!from?"EMAIL_FROM":null].filter(Boolean)});return;}
 const send=async(payload:Record<string,unknown>,kind:"internal"|"applicant")=>{
  try{const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store"});if(!response.ok)console.error("Early access email failed",{kind,status:response.status});}
  catch{console.error("Early access email request failed",{kind});}
 };
 await send({from,to:[recipient],reply_to:lead.email,subject:`Servonas early-access lead: ${lead.business_name}`,text:`Business: ${lead.business_name}\nContact: ${lead.contact_name}\nEmail: ${lead.email}\nPhone: ${lead.phone||"Not provided"}\nLocation: ${[lead.business_city,lead.business_state].filter(Boolean).join(", ")||"Not provided"}\nCurrent software: ${lead.current_software}\nInventory: ${lead.inventory_size||"Not provided"}\nChallenge: ${lead.biggest_challenge||"Not provided"}\nSource: ${source||"Direct"}`},"internal");
 await send({from,to:[lead.email],reply_to:recipient,subject:"You're on the Servonas early-access list",text:`Thanks for your interest in Servonas, ${lead.contact_name}.\n\nWe received your early-access inquiry for ${lead.business_name}. We'll review your information and reach out as early-access opportunities become available.\n\nThis confirmation does not guarantee immediate access or a specific onboarding date.\n\n— Servonas`},"applicant");
}

async function allowed(admin:NonNullable<ReturnType<typeof getSupabaseAdmin>>,ip:string){
 const ipHash=createHash("sha256").update(`${process.env.EARLY_ACCESS_RATE_LIMIT_SALT||"early-access"}:${ip}`).digest("hex"),now=new Date(),cutoff=new Date(now.getTime()-60*60*1000).toISOString();
 const {data:existing,error}=await admin.from("platform_early_access_submission_limits").select("window_started_at,submission_count").eq("ip_hash",ipHash).maybeSingle();
 if(error)return false;
 if(!existing||existing.window_started_at<cutoff){const {error:writeError}=await admin.from("platform_early_access_submission_limits").upsert({ip_hash:ipHash,window_started_at:now.toISOString(),submission_count:1,updated_at:now.toISOString()});return !writeError;}
 if(existing.submission_count>=5)return false;
 const {error:writeError}=await admin.from("platform_early_access_submission_limits").update({submission_count:existing.submission_count+1,updated_at:now.toISOString()}).eq("ip_hash",ipHash).eq("submission_count",existing.submission_count);return !writeError;
}

export async function POST(request:Request){
 const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
 if(!body)return NextResponse.json({error:"Please review the form and try again."},{status:400});
 if(safe(body.website,200))return NextResponse.json({ok:true});
 const lead=parseEarlyAccessLead(body);
 if(!lead)return NextResponse.json({error:"Please complete the required fields and consent checkbox."},{status:400});
 const admin=getSupabaseAdmin();
 if(!admin)return NextResponse.json({error:"Early access is temporarily unavailable. Please try again shortly."},{status:503});
 if(!await allowed(admin,clientIp(request)))return NextResponse.json({error:"Please wait before submitting another request."},{status:429});
 const attribution={source:safe(body.source,120)||null,utm_source:safe(body.utmSource,120)||null,utm_medium:safe(body.utmMedium,120)||null,utm_campaign:safe(body.utmCampaign,160)||null,utm_content:safe(body.utmContent,160)||null,utm_term:safe(body.utmTerm,160)||null,landing_page:safe(body.landingPage,500)||"/early-access"};
 const {data:existing}=await admin.from("platform_early_access_leads").select("id").ilike("email",lead.email).maybeSingle();
 const persisted=existing?.id
  ? await admin.from("platform_early_access_leads").update({...lead,...attribution,consent_version:EARLY_ACCESS_CONSENT_VERSION,consent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",existing.id)
  : await admin.from("platform_early_access_leads").insert({...lead,...attribution,consent_version:EARLY_ACCESS_CONSENT_VERSION,consent_at:new Date().toISOString()});
 if(persisted.error){console.error("Early access persistence failed",{code:persisted.error.code});return NextResponse.json({error:"We could not save your interest. Please try again."},{status:503});}
 if(!existing?.id)await sendEarlyAccessEmails(lead,attribution.utm_source||attribution.source);
 return NextResponse.json({ok:true});
}
