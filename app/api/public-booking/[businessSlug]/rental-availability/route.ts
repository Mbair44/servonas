import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {zonedDateTimeToUtc} from "@/lib/bookingTime";

const activeStatuses=["pending_payment","paid","confirmed"];

export async function GET(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,url=new URL(request.url),date=url.searchParams.get("date"),endDate=url.searchParams.get("endDate")||date,start=url.searchParams.get("start"),end=url.searchParams.get("end");
 if(!date||!endDate||!start||!end)return NextResponse.json({error:"Choose a valid rental date and time."},{status:400});
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Availability is temporarily unavailable."},{status:503});
 const {data:settings}=await db.from("booking_settings").select("business_id,buffer_minutes,timezone").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();
 if(!settings)return NextResponse.json({error:"Booking page not found."},{status:404});
 const requestedStartsAt=zonedDateTimeToUtc(date,start,settings.timezone??"America/Phoenix"),requestedEndsAt=zonedDateTimeToUtc(endDate,end,settings.timezone??"America/Phoenix");
 if(requestedEndsAt<=requestedStartsAt)return NextResponse.json({error:"Choose an end after the rental start."},{status:400});
 const [{data:items},{data:blocked},{data:reserved,error},{data:blackouts,error:blackoutError}]=await Promise.all([
  db.from("inventory_items").select("id,stock_quantity").eq("business_id",settings.business_id).eq("active",true),
  db.from("blocked_dates").select("inventory_item_id").eq("business_id",settings.business_id).gte("blocked_date",date).lte("blocked_date",endDate),
  db.from("booking_items").select("inventory_item_id,quantity,rental_date,bookings!inner(event_start_time,event_end_time,rental_starts_at,rental_ends_at,business_id)").in("status",activeStatuses).eq("bookings.business_id",settings.business_id),
  db.from("booking_blackouts").select("id").eq("business_id",settings.business_id).lt("starts_at",requestedEndsAt.toISOString()).gt("ends_at",requestedStartsAt.toISOString()).limit(1),
 ]);
 if(error||blackoutError)return NextResponse.json({error:"Availability could not be checked."},{status:500});
 const buffer=Math.max(0,Number(settings.buffer_minutes||0));
 const used=new Map<string,number>();
 for(const row of reserved??[]){const booking=Array.isArray(row.bookings)?row.bookings[0]:row.bookings;if(!booking)continue;const existingStart=booking.rental_starts_at?new Date(booking.rental_starts_at):zonedDateTimeToUtc(row.rental_date,booking.event_start_time,settings.timezone??"America/Phoenix"),existingEnd=booking.rental_ends_at?new Date(booking.rental_ends_at):zonedDateTimeToUtc(row.rental_date,booking.event_end_time,settings.timezone??"America/Phoenix");if(existingStart.getTime()<requestedEndsAt.getTime()+buffer*60000&&existingEnd.getTime()+buffer*60000>requestedStartsAt.getTime())used.set(row.inventory_item_id,(used.get(row.inventory_item_id)??0)+Number(row.quantity||0));}
 const blockedIds=new Set((blocked??[]).map(row=>row.inventory_item_id));
 const businessBlocked=Boolean(blackouts?.length);
 return NextResponse.json({availability:Object.fromEntries((items??[]).map(item=>[item.id,businessBlocked||blockedIds.has(item.id)?0:Math.max(0,Number(item.stock_quantity)-Number(used.get(item.id)??0))])),bufferMinutes:buffer,businessBlocked},{headers:{"Cache-Control":"no-store"}});
}
