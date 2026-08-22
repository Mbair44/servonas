import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {addDays,zonedDateTimeToUtc} from "@/lib/bookingTime";
import {resolveRentalCalendarDayAvailability,type RentalReservationWindow} from "@/lib/rentalCalendarAvailability";

const activeStatuses=["pending_payment","paid","confirmed"];
const itemIdPattern=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const time=(value:string)=>value.slice(0,5);
const daysBetween=(start:string,end:string)=>{const days:string[]=[];for(let value=start;value<=end;value=addDays(value,1))days.push(value);return days;};

function reservationWindowFromRow({booking,row,timezone}:{booking:any;row:any;timezone:string}):RentalReservationWindow|null{
 if(booking?.rental_starts_at&&booking?.rental_ends_at){
  const startsAt=new Date(booking.rental_starts_at),endsAt=new Date(booking.rental_ends_at);
  if(Number.isNaN(startsAt.getTime())||Number.isNaN(endsAt.getTime())||endsAt<=startsAt)return null;
  return {startsAt,endsAt,quantity:Number(row.quantity||0)};
 }
 if(!row?.rental_date||typeof booking?.event_start_time!=="string"||typeof booking?.event_end_time!=="string")return null;
 const startClock=time(booking.event_start_time),endClock=time(booking.event_end_time);
 if(startClock.length!==5||endClock.length!==5)return null;
 const startsAt=zonedDateTimeToUtc(row.rental_date,startClock,timezone),endsAt=zonedDateTimeToUtc(row.rental_date,endClock,timezone);
 if(Number.isNaN(startsAt.getTime())||Number.isNaN(endsAt.getTime())||endsAt<=startsAt)return null;
 return {startsAt,endsAt,quantity:Number(row.quantity||0)};
}

async function loadCalendarAvailability({db,businessId,timezone,itemId,startDate,endDate,requestedQuantity,bufferMinutes,rentalDurationMinutes}:{db:NonNullable<ReturnType<typeof getSupabaseAdmin>>;businessId:string;timezone:string;itemId:string;startDate:string;endDate:string;requestedQuantity:number;bufferMinutes:number;rentalDurationMinutes:number}){
 const [{data:item},{data:hours},{data:blocked},{data:reservationRows,error:reservationError},{data:blackouts,error:blackoutError}]=await Promise.all([
  db.from("inventory_items").select("id,stock_quantity").eq("id",itemId).eq("business_id",businessId).eq("active",true).maybeSingle(),
  db.from("booking_availability").select("weekday,start_time,end_time").eq("business_id",businessId).eq("active",true),
  db.from("blocked_dates").select("blocked_date").eq("business_id",businessId).eq("inventory_item_id",itemId).gte("blocked_date",startDate).lte("blocked_date",endDate),
  db.from("booking_items").select("quantity,rental_date,bookings!inner(event_start_time,event_end_time,rental_starts_at,rental_ends_at,business_id)").eq("inventory_item_id",itemId).in("status",activeStatuses).eq("bookings.business_id",businessId),
  db.from("booking_blackouts").select("starts_at,ends_at").eq("business_id",businessId).lt("starts_at",zonedDateTimeToUtc(addDays(endDate,1),"00:00",timezone).toISOString()).gt("ends_at",zonedDateTimeToUtc(startDate,"00:00",timezone).toISOString()),
 ]);
 if(!item)return {error:"Rental item not found.",status:404 as const};
 if(reservationError||blackoutError){
  console.error("Rental availability calendar query failed",{businessId,itemId,startDate,endDate,reservationError:blackoutError?reservationError?.message:reservationError?.message,blackoutError:blackoutError?.message});
  return {error:"Availability could not be checked.",status:500 as const};
 }
 const reservations:RentalReservationWindow[]=[];
 for(const row of reservationRows??[]){const booking=Array.isArray(row.bookings)?row.bookings[0]:row.bookings;const reservation=reservationWindowFromRow({booking,row,timezone});if(!reservation){console.warn("Skipping invalid rental availability reservation row",{businessId,itemId,row});continue;}reservations.push(reservation);}
 const blockedDates=new Set((blocked??[]).map(row=>String(row.blocked_date))),businessBlackouts=(blackouts??[]).map(row=>({startsAt:new Date(row.starts_at),endsAt:new Date(row.ends_at)})),hoursByWeekday=new Map((hours??[]).map(row=>[Number(row.weekday),{start:time(row.start_time),end:time(row.end_time)}]));
 return {days:Object.fromEntries(daysBetween(startDate,endDate).map(value=>{const hours=hoursByWeekday.get(new Date(`${value}T12:00:00`).getDay());if(!hours)return [value,{available:false,reason:"blocked"}];return [value,resolveRentalCalendarDayAvailability({openingStart:zonedDateTimeToUtc(value,hours.start,timezone),openingEnd:zonedDateTimeToUtc(value,hours.end,timezone),rentalDurationMinutes,turnaroundMinutes:bufferMinutes,stockQuantity:Number(item.stock_quantity),requestedQuantity,hardBlocked:blockedDates.has(value),reservations,businessBlackouts})]}))};
}

export async function GET(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 try{
 const {businessSlug}=await params,url=new URL(request.url),date=url.searchParams.get("date"),endDate=url.searchParams.get("endDate")||date,start=url.searchParams.get("start"),end=url.searchParams.get("end"),itemId=url.searchParams.get("itemId"),calendarStart=url.searchParams.get("calendarStart"),calendarEnd=url.searchParams.get("calendarEnd"),requestedQuantity=Number(url.searchParams.get("quantity")||1),quantity=Number.isFinite(requestedQuantity)?Math.max(1,Math.floor(requestedQuantity)):1;
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Availability is temporarily unavailable."},{status:503});
 const {data:settings}=await db.from("booking_settings").select("business_id,buffer_minutes,timezone,rental_duration_minutes").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();
 if(!settings)return NextResponse.json({error:"Booking page not found."},{status:404});
 const timezone=settings.timezone??"America/Phoenix",buffer=Math.max(0,Number(settings.buffer_minutes||0));
 if(itemId&&calendarStart&&calendarEnd){
  if(!itemIdPattern.test(itemId)||!datePattern.test(calendarStart)||!datePattern.test(calendarEnd)||calendarEnd<calendarStart)return NextResponse.json({error:"Choose a valid calendar range."},{status:400});
  const result=await loadCalendarAvailability({db,businessId:settings.business_id,timezone,itemId,startDate:calendarStart,endDate:calendarEnd,requestedQuantity:quantity,bufferMinutes:buffer,rentalDurationMinutes:Math.max(30,Number(settings.rental_duration_minutes||240))});
  if("error" in result)return NextResponse.json({error:result.error},{status:result.status});
  return NextResponse.json({days:result.days},{headers:{"Cache-Control":"private, max-age=60"}});
 }
 if(!date||!endDate||!start||!end)return NextResponse.json({error:"Choose a valid rental date and time."},{status:400});
 const requestedStartsAt=zonedDateTimeToUtc(date,start,timezone),requestedEndsAt=zonedDateTimeToUtc(endDate,end,timezone);
 if(requestedEndsAt<=requestedStartsAt)return NextResponse.json({error:"Choose an end after the rental start."},{status:400});
 const [{data:items},{data:blocked},{data:reserved,error},{data:blackouts,error:blackoutError}]=await Promise.all([
  db.from("inventory_items").select("id,stock_quantity").eq("business_id",settings.business_id).eq("active",true),
  db.from("blocked_dates").select("inventory_item_id").eq("business_id",settings.business_id).gte("blocked_date",date).lte("blocked_date",endDate),
  db.from("booking_items").select("inventory_item_id,quantity,rental_date,bookings!inner(event_start_time,event_end_time,rental_starts_at,rental_ends_at,business_id)").in("status",activeStatuses).eq("bookings.business_id",settings.business_id),
  db.from("booking_blackouts").select("id").eq("business_id",settings.business_id).lt("starts_at",requestedEndsAt.toISOString()).gt("ends_at",requestedStartsAt.toISOString()).limit(1),
 ]);
 if(error||blackoutError){
  console.error("Rental availability query failed",{businessSlug,businessId:settings.business_id,date,endDate,start,end,queryError:error?.message,blackoutError:blackoutError?.message});
  return NextResponse.json({error:"Availability could not be checked."},{status:500});
 }
 const used=new Map<string,number>();
 for(const row of reserved??[]){const booking=Array.isArray(row.bookings)?row.bookings[0]:row.bookings;const reservation=reservationWindowFromRow({booking,row,timezone});if(!reservation){console.warn("Skipping invalid rental availability overlap row",{businessSlug,businessId:settings.business_id,row});continue;}if(reservation.startsAt.getTime()<requestedEndsAt.getTime()+buffer*60000&&reservation.endsAt.getTime()+buffer*60000>requestedStartsAt.getTime())used.set(row.inventory_item_id,(used.get(row.inventory_item_id)??0)+Number(row.quantity||0));}
 const blockedIds=new Set((blocked??[]).map(row=>row.inventory_item_id)),businessBlocked=Boolean(blackouts?.length);
 return NextResponse.json({availability:Object.fromEntries((items??[]).map(item=>[item.id,businessBlocked||blockedIds.has(item.id)?0:Math.max(0,Number(item.stock_quantity)-Number(used.get(item.id)??0))])),bufferMinutes:buffer,businessBlocked},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  console.error("Rental availability endpoint crashed",{error:error instanceof Error?error.message:String(error),stack:error instanceof Error?error.stack:undefined});
  return NextResponse.json({error:"Availability could not be checked."},{status:500});
 }
}
