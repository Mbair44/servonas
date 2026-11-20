import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

type Entry={sessionId:string;eventKey:string;event:string;occurredAt:string;path:string;utmSource?:string|null;utmMedium?:string|null;utmCampaign?:string|null;utmContent?:string|null;utmTerm?:string|null;utmId?:string|null;fbclid?:string|null};
const allowed=new Set(["landing_page_view","booking_started","button_click","event_date_changed","promotion_landing_view","final_price_presented","event_date_selected","reservation_details_viewed","form_start","checkout_started","booking_cta_click","checkout_addons_viewed","inventory_item_clicked","link_click","checkout_addons_skipped","item_added_to_cart","reserve_clicked","availability_check","availability_check_started","checkout_addons_added","inventory_item_view"]);

export async function POST(request:Request){
 const token=request.headers.get("x-booking-recovery-token")||"";
 if(!process.env.BOOKING_FUNNEL_RECOVERY_TOKEN||token!==process.env.BOOKING_FUNNEL_RECOVERY_TOKEN)return NextResponse.json({error:"Unauthorized"},{status:401});
 const body=await request.json().catch(()=>null) as {entries?:Entry[]}|null,entries=body?.entries;
 if(!Array.isArray(entries)||!entries.length||entries.length>500||entries.some(e=>!e||!allowed.has(e.event)||!e.sessionId||!e.eventKey||!Number.isFinite(Date.parse(e.occurredAt))))return NextResponse.json({error:"Invalid recovery payload"},{status:400});
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Database unavailable"},{status:503});
 const {data:business}=await db.from("businesses").select("id").ilike("slug","copper-state-bounce").maybeSingle();if(!business)return NextResponse.json({error:"Business unavailable"},{status:404});
 const sessions=[...new Map(entries.map(e=>[e.sessionId,e])).values()].map(e=>({id:e.sessionId,business_id:business.id,first_landing_path:e.path,first_seen_at:e.occurredAt,last_seen_at:e.occurredAt,utm_source:e.utmSource??null,utm_medium:e.utmMedium??null,utm_campaign:e.utmCampaign??null,utm_content:e.utmContent??null,utm_term:e.utmTerm??null,utm_id:e.utmId??null,fbclid:e.fbclid??null}));
 const {error:sessionError}=await db.from("booking_attribution_sessions").upsert(sessions,{onConflict:"id",ignoreDuplicates:true});if(sessionError)return NextResponse.json({error:sessionError.message},{status:500});
 const rows=entries.map(e=>({business_id:business.id,attribution_session_id:e.sessionId,event_name:e.event,event_key:e.eventKey,occurred_at:e.occurredAt,metadata:{recovered:true,recovery_source:"vercel_diagnostic",recovered_path:e.path}}));
 const {error:eventError}=await db.from("booking_funnel_events").upsert(rows,{onConflict:"event_key",ignoreDuplicates:true});if(eventError)return NextResponse.json({error:eventError.message},{status:500});
 return NextResponse.json({sessions:sessions.length,events:rows.length});
}
