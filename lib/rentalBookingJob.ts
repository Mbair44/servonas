import type {SupabaseClient} from "@supabase/supabase-js";
import {zonedDateTimeToUtc} from "@/lib/bookingTime";

export async function ensureRentalBookingJob(db:SupabaseClient,bookingId:string){
 const {data:booking,error}=await db.from("bookings").select("id,business_id,customer_id,job_id,event_start_time,event_end_time,delivery_address,delivery_city,delivery_state,delivery_zip,notes,total_cents,balance_due_cents,amount_paid_cents,bookings_items:booking_items(rental_date,quantity,operator_selected,operator_billable_hours,operator_hourly_rate_cents,operator_charge_cents,inventory_items(name))").eq("id",bookingId).maybeSingle();
 if(error||!booking)throw new Error(`Rental booking could not be loaded (${error?.code??"not_found"}).`);
 if(booking.job_id)return booking.job_id;
 if(!booking.business_id||!booking.customer_id)throw new Error("Rental booking is missing its business or customer.");
 const {data:business}=await db.from("businesses").select("timezone").eq("id",booking.business_id).maybeSingle();
 const items=(booking.bookings_items??[]) as any[];
 const rentalDate=items[0]?.rental_date as string|undefined;
 if(!rentalDate||!booking.event_start_time||!booking.event_end_time)throw new Error("Rental booking is missing its event schedule.");
 const address=[booking.delivery_address,booking.delivery_city,booking.delivery_state,booking.delivery_zip].filter(Boolean).join(", ");
 let {data:location}=await db.from("service_locations").select("id").eq("business_id",booking.business_id).eq("customer_id",booking.customer_id).eq("street_address",booking.delivery_address).eq("is_deleted",false).limit(1).maybeSingle();
 if(!location){const {count}=await db.from("service_locations").select("id",{count:"exact",head:true}).eq("business_id",booking.business_id).eq("customer_id",booking.customer_id).eq("is_deleted",false);const created=await db.from("service_locations").insert({business_id:booking.business_id,customer_id:booking.customer_id,location_name:(count??0)===0?"Primary location":"Event location",street_address:booking.delivery_address,city:booking.delivery_city,state:booking.delivery_state||"N/A",postal_code:booking.delivery_zip,country:"US",is_primary:(count??0)===0,is_active:true}).select("id").single();if(created.error)throw new Error(`Rental location could not be created (${created.error.code}).`);location=created.data;}
 const timeZone=business?.timezone||"America/Phoenix",start=zonedDateTimeToUtc(rentalDate,String(booking.event_start_time).slice(0,5),timeZone),end=zonedDateTimeToUtc(rentalDate,String(booking.event_end_time).slice(0,5),timeZone);
 const itemSummary=items.flatMap(row=>{const item=Array.isArray(row.inventory_items)?row.inventory_items[0]:row.inventory_items,lines=[`${item?.name??"Rental item"} × ${row.quantity}`];if(row.operator_selected)lines.push(`Professional Operator: ${row.operator_billable_hours} hour${row.operator_billable_hours===1?"":"s"} × $${(Number(row.operator_hourly_rate_cents??0)/100).toFixed(2)}/hour — $${(Number(row.operator_charge_cents??0)/100).toFixed(2)}`);return lines;});
 const firstItem=items[0]&&(Array.isArray(items[0].inventory_items)?items[0].inventory_items[0]:items[0].inventory_items);
 const payload={business_id:booking.business_id,customer_id:booking.customer_id,service_location_id:location.id,title:items.length===1&&firstItem?.name?firstItem.name:"Party rental reservation",status:"scheduled",starts_at:start.toISOString(),ends_at:end.toISOString(),service_address:address,description:["Rental items:",...itemSummary,booking.notes?`Notes: ${booking.notes}`:""].filter(Boolean).join("\n"),subtotal:Number(booking.total_cents||0)/100,tax_amount:0,booking_source:"website",estimated_duration_minutes:Math.max(1,Math.round((end.getTime()-start.getTime())/60000)),payment_status:Number(booking.amount_paid_cents||0)>0?(Number(booking.balance_due_cents||0)>0?"partially_paid":"paid"):"unpaid",request_key:booking.id};
 let {data:job,error:jobError}=await db.from("jobs").insert(payload).select("id").single();
 if(jobError?.code==="23505"){const existing=await db.from("jobs").select("id").eq("business_id",booking.business_id).eq("request_key",booking.id).maybeSingle();job=existing.data;jobError=existing.error;}
 if(jobError||!job)throw new Error(`Rental job could not be created (${jobError?.code??"unknown"}).`);
 const linked=await db.from("bookings").update({job_id:job.id}).eq("id",booking.id).is("job_id",null);
 if(linked.error)throw new Error(`Rental job could not be linked (${linked.error.code}).`);
 return job.id;
}
