import {createHmac} from "node:crypto";
import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {optionalAnalyticsEnabled} from "@/lib/optionalAnalytics";

const bots=/bot|crawler|spider|facebookexternalhit|googleother|headless|lighthouse|playwright|puppeteer|preview|scanner/i;
const allowedEvents=new Set(["page_view","click","signup_completed"]);
const allowedElementTypes=new Set(["a","button"]);
const timeoutMs=1200;

const clean=(value:unknown,max=1000)=>typeof value==="string"?value.trim().slice(0,max):"";
const nullish=(value:string)=>value||null;
const uuid=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const deviceType=(value:string)=>/ipad|tablet/i.test(value)?"tablet":/mobile|android|iphone/i.test(value)?"mobile":"desktop";

function eventFingerprint(input:{visitorId:string;sessionId:string;eventType:string;path:string;label:string;elementType:string;href:string}){
 return createHmac("sha256","servonas-marketing-events")
  .update(`${input.visitorId}|${input.sessionId}|${input.eventType}|${input.path}|${input.label}|${input.elementType}|${input.href}`)
  .digest("hex")
  .slice(0,24);
}

async function withTimeout<T>(work:Promise<T>,label:string){
 return await Promise.race([
  work,
  new Promise<T>((_,reject)=>setTimeout(()=>reject(new Error(label)),timeoutMs)),
 ]);
}

export async function POST(request:Request){
 const purpose=request.headers.get("purpose")||request.headers.get("x-middleware-prefetch")||"";
 const ua=request.headers.get("user-agent")||"";
 if(!optionalAnalyticsEnabled())return new NextResponse(null,{status:204});
 if(/prefetch/i.test(purpose)||bots.test(ua))return new NextResponse(null,{status:204});

 const body=await request.json().catch(()=>null) as {
  visitorId?:string;sessionId?:string;eventType?:string;path?:string;referrer?:string;label?:string;elementType?:string;href?:string;
  utmSource?:string;utmMedium?:string;utmCampaign?:string;utmContent?:string;utmTerm?:string;gclid?:string;gbraid?:string;wbraid?:string;
  browser?:string;operatingSystem?:string;deviceType?:string;
 }|null;
 if(!body||!uuid(body.visitorId)||!uuid(body.sessionId)||!allowedEvents.has(String(body.eventType)))return new NextResponse(null,{status:400});

 const db=getSupabaseAdmin();
 if(!db)return new NextResponse(null,{status:204});

 const eventType=String(body.eventType);
 const path=clean(body.path,1000);
 const label=clean(body.label,300);
 const elementType=clean(body.elementType,20).toLowerCase();
 const href=clean(body.href,2000);
 if(eventType==="click"&&!allowedElementTypes.has(elementType))return new NextResponse(null,{status:204});

 const now=new Date().toISOString();
 const visitorRow={
  visitor_id:String(body.visitorId),
  last_seen_at:now,
  updated_at:now,
  first_landing_path:eventType==="page_view"?path||"/":undefined,
  last_landing_path:path||"/",
  first_referrer:eventType==="page_view"?nullish(clean(body.referrer,2000)):undefined,
  last_referrer:nullish(clean(body.referrer,2000)),
  utm_source:nullish(clean(body.utmSource,200)),
  utm_medium:nullish(clean(body.utmMedium,200)),
  utm_campaign:nullish(clean(body.utmCampaign,200)),
  utm_content:nullish(clean(body.utmContent,200)),
  utm_term:nullish(clean(body.utmTerm,200)),
  gclid:nullish(clean(body.gclid,500)),
  gbraid:nullish(clean(body.gbraid,500)),
  wbraid:nullish(clean(body.wbraid,500)),
  user_agent:nullish(clean(ua,1000)),
  browser:nullish(clean(body.browser,100)),
  operating_system:nullish(clean(body.operatingSystem,100)),
  device_type:nullish(clean(body.deviceType,50))??deviceType(ua),
 };

 const metadata=eventType==="click"?{
  href:nullish(href),
  fingerprint:eventFingerprint({visitorId:String(body.visitorId),sessionId:String(body.sessionId),eventType,path,label,elementType,href}),
 }:{};

 try{
  await withTimeout((async()=>{
   const existing=await db.from("marketing_visitors").select("visitor_id,visit_count").eq("visitor_id",body.visitorId as string).maybeSingle();
   const visitCount=(existing.data?.visit_count??0)+(eventType==="page_view"?1:0);
   await db.from("marketing_visitors").upsert({...visitorRow,visit_count:visitCount},{onConflict:"visitor_id"});
   await db.from("marketing_page_events").insert({
    visitor_id:body.visitorId,
    session_id:body.sessionId,
    event_type:eventType,
    path:path||"/",
    label:nullish(label),
    element_type:nullish(elementType),
    utm_content:nullish(clean(body.utmContent,200)),
    metadata,
   });
  })(),"marketing_event_timeout");
  return new NextResponse(null,{status:204});
 }catch(error){
  console.warn("Marketing event skipped",{
   route:"/api/marketing/events",
   eventType,
   path:path||"/",
   reason:error instanceof Error?error.message:"unknown",
  });
  return new NextResponse(null,{status:204});
 }
}
