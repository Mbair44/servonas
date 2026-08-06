import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {zonedDateTimeToUtc} from "@/lib/bookingTime";

const activeStatuses=["pending_payment","paid","confirmed"];
const minutes=(value:string)=>{const [hour,minute]=value.slice(0,5).split(":").map(Number);return hour*60+minute;};

export async function GET(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,url=new URL(request.url),date=url.searchParams.get("date"),start=url.searchParams.get("start"),end=url.searchParams.get("end");
 if(!date||!start||!end||end<=start)return NextResponse.json({error:"Choose a valid rental date and time."},{status:400});
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Availability is temporarily unavailable."},{status:503});
 const {data:settings}=await db.from("booking_settings").select("business_id,buffer_minutes,timezone").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();
 if(!settings)return NextResponse.json({error:"Booking page not found."},{status:404});
 const requestedStartsAt=zonedDateTimeToUtc(date,start,settings.timezone??"America/Phoenix"),requestedEndsAt=zonedDateTimeToUtc(date,end,settings.timezone??"America/Phoenix");
 const [{data:items},{data:blocked},{data:reserved,error},{data:blackouts,error:blackoutError}]=await Promise.all([
  db.from("inventory_items").select("id,stock_quantity").eq("business_id",settings.business_id).eq("active",true),
  db.from("blocked_dates").select("inventory_item_id").eq("business_id",settings.business_id).eq("blocked_date",date),
  db.from("booking_items").select("inventory_item_id,quantity,bookings!inner(event_start_time,event_end_time,business_id)").eq("rental_date",date).in("status",activeStatuses).eq("bookings.business_id",settings.business_id),
  db.from("booking_blackouts").select("id").eq("business_id",settings.business_id).lt("starts_at",requestedEndsAt.toISOString()).gt("ends_at",requestedStartsAt.toISOString()).limit(1),
 ]);
 if(error||blackoutError)return NextResponse.json({error:"Availability could not be checked."},{status:500});
 const requestedStart=minutes(start),requestedEnd=minutes(end),buffer=Math.max(0,Number(settings.buffer_minutes||0));
 const used=new Map<string,number>();
 for(const row of reserved??[]){const booking=Array.isArray(row.bookings)?row.bookings[0]:row.bookings;if(!booking)continue;const existingStart=minutes(booking.event_start_time),existingEnd=minutes(booking.event_end_time);if(existingStart<requestedEnd+buffer&&existingEnd+buffer>requestedStart)used.set(row.inventory_item_id,(used.get(row.inventory_item_id)??0)+Number(row.quantity||0));}
 const blockedIds=new Set((blocked??[]).map(row=>row.inventory_item_id));
 const businessBlocked=Boolean(blackouts?.length);
 return NextResponse.json({availability:Object.fromEntries((items??[]).map(item=>[item.id,businessBlocked||blockedIds.has(item.id)?0:Math.max(0,Number(item.stock_quantity)-Number(used.get(item.id)??0))])),bufferMinutes:buffer,businessBlocked},{headers:{"Cache-Control":"no-store"}});
}
