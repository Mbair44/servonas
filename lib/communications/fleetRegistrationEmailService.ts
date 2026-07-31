import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

const milestones=new Set([30,14,7,0]);
const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
const localDate=(timeZone:string)=>{const parts=new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),part=(type:string)=>parts.find(item=>item.type===type)?.value??"";return `${part("year")}-${part("month")}-${part("day")}`;};
const dayDifference=(later:string,earlier:string)=>(Date.parse(`${later}T12:00:00Z`)-Date.parse(`${earlier}T12:00:00Z`))/86_400_000;

export async function sendFleetRegistrationReminders(){
 const db=getSupabaseAdmin();if(!db)return {sent:0,failed:0,skipped:0};
 const maxDate=new Date(Date.now()+31*86_400_000).toISOString().slice(0,10);
 const {data:assets,error}=await db.from("workforce_assets").select("id,business_id,name,asset_number,license_plate,registration_expires_on,businesses(name,slug,email,timezone)").in("asset_type",["vehicle","trailer"]).not("status","in",'("retired","lost")').not("registration_expires_on","is",null).lte("registration_expires_on",maxDate);
 if(error){console.error("Fleet registration reminder scan failed",{code:error.code});return {sent:0,failed:1,skipped:0};}
 let sent=0,failed=0,skipped=0;
 for(const asset of assets??[]){
  const business=Array.isArray(asset.businesses)?asset.businesses[0]:asset.businesses;if(!business)continue;
  const days=dayDifference(asset.registration_expires_on!,localDate(business.timezone||"America/Phoenix"));
  if(!milestones.has(days)){skipped++;continue;}
  const {data:members}=await db.from("business_members").select("user_id,role").eq("business_id",asset.business_id).in("role",["owner","admin"]);
  const emails=new Set<string>();if(business.email)emails.add(String(business.email).trim().toLowerCase());
  for(const member of members??[]){const {data:user}=await db.auth.admin.getUserById(member.user_id);if(user.user?.email)emails.add(user.user.email.toLowerCase());}
  for(const recipient of emails){
   const key={asset_id:asset.id,registration_expires_on:asset.registration_expires_on,days_before:days,recipient_email:recipient};
   const {data:existing}=await db.from("fleet_registration_notification_events").select("id,status").match(key).maybeSingle();
   if(existing?.status==="sent"){skipped++;continue;}
   const saved=existing?await db.from("fleet_registration_notification_events").update({status:"pending",error_message:null}).eq("id",existing.id).select("id").single():await db.from("fleet_registration_notification_events").insert({business_id:asset.business_id,...key}).select("id").single();
   if(saved.error||!saved.data){failed++;continue;}
   const apiKey=process.env.RESEND_API_KEY,from=process.env.EMAIL_FROM;
   if(!apiKey||!from){await db.from("fleet_registration_notification_events").update({status:"failed",error_message:"Resend email is not configured."}).eq("id",saved.data.id);failed++;continue;}
   const expiration=new Intl.DateTimeFormat("en-US",{dateStyle:"long",timeZone:"UTC"}).format(new Date(`${asset.registration_expires_on}T12:00:00Z`));
   const timing=days===0?"expires today":`expires in ${days} days`,vehicle=[asset.name,asset.license_plate?`plate ${asset.license_plate}`:null,asset.asset_number?`asset ${asset.asset_number}`:null].filter(Boolean).join(" · ");
   const link=`${(process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||"https://servonas.com").replace(/\/$/,"")}/app/${encodeURIComponent(business.slug)}/equipment?asset=${asset.id}`;
   const subject=`Registration ${timing}: ${asset.name}`;
   const text=`${business.name} fleet reminder\n\n${vehicle}\nRegistration ${timing} (${expiration}).\n\nReview equipment: ${link}`;
   try{
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[recipient],subject,text,html:`<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Fleet registration reminder</h2><p><strong>${esc(vehicle)}</strong></p><p>Registration ${esc(timing)} on <strong>${esc(expiration)}</strong>.</p><p><a href="${esc(link)}">Review equipment in Servonas</a></p></div>`})});
    const provider=await response.json() as {id?:string;message?:string};if(!response.ok||!provider.id)throw new Error(provider.message||`Resend HTTP ${response.status}`);
    await db.from("fleet_registration_notification_events").update({status:"sent",provider_message_id:provider.id,sent_at:new Date().toISOString(),error_message:null}).eq("id",saved.data.id);sent++;
   }catch(error){const message=error instanceof Error?error.message:"Email failed";await db.from("fleet_registration_notification_events").update({status:"failed",error_message:message.slice(0,1000)}).eq("id",saved.data.id);console.error("Fleet registration reminder failed",{assetId:asset.id,recipient,message});failed++;}
  }
 }
 return {sent,failed,skipped};
}
