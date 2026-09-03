import type {SupabaseClient} from "@supabase/supabase-js";

export const bookingFunnelEvents=["landing_page_view","inventory_item_view","inventory_item_clicked","check_availability_clicked","availability_date_selected","booking_started","customer_info_entered","checkout_started","booking_completed","availability_check_started","event_date_selected","available_inventory_viewed","rental_viewed","rental_availability_checked","rental_available","rental_unavailable","reserve_clicked","item_added_to_cart","event_date_changed","unavailable_alternative_clicked","landing_view","service_view","inventory_view","booking_cta_click","availability_check","date_selected","lead_submitted","payment_completed","session_heartbeat","link_click","button_click","phone_click","sms_click","email_click","form_start","form_submit","product_service_selection"] as const;
export type BookingFunnelEvent=typeof bookingFunnelEvents[number];
export const attributionKeys=["gclid","gbraid","wbraid","fbclid","utm_source","utm_medium","utm_campaign","utm_content","utm_term"] as const;
export type AttributionValues=Partial<Record<typeof attributionKeys[number],string>>;

export const bookingFunnelEventAliases={
 landing_page_view:"landing_view",
 rental_viewed:"inventory_view",
 inventory_item_view:"inventory_view",
 inventory_item_clicked:"booking_cta_click",
 check_availability_clicked:"booking_cta_click",
 availability_check_started:"availability_check",
 rental_availability_checked:"availability_check",
 availability_date_selected:"date_selected",
 event_date_selected:"date_selected",
 event_date_changed:"date_selected",
 booking_started:"conversion_started",
 customer_info_entered:"lead_submitted",
 available_inventory_viewed:"engaged",
 reserve_clicked:"conversion_started",
 item_added_to_cart:"conversion_started",
 booking_completed:"lead_or_booking",
 payment_completed:"revenue",
} as const;

const clean=(value:unknown,max=500)=>typeof value==="string"?value.trim().slice(0,max):"";
export const validSessionId=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function recordBookingFunnelEvent(db:SupabaseClient,input:{businessId:string;sessionId?:string|null;event:BookingFunnelEvent;bookingId?:string|null;customerId?:string|null;inventoryItemId?:string|null;serviceId?:string|null;invoiceId?:string|null;metadata?:Record<string,unknown>;eventKey?:string|null;bookingTotalCents?:number|null;amountPaidCents?:number|null;currency?:string|null}){
 const row={business_id:input.businessId,attribution_session_id:validSessionId(input.sessionId)?input.sessionId:null,booking_id:input.bookingId??null,customer_id:input.customerId??null,inventory_item_id:input.inventoryItemId??null,service_id:input.serviceId??null,invoice_id:input.invoiceId??null,event_name:input.event,event_key:input.eventKey??null,metadata:input.metadata??{},booking_total_cents:input.bookingTotalCents??null,amount_paid_cents:input.amountPaidCents??null,currency:input.currency??"USD"};
 const result=await db.from("booking_funnel_events").insert(row);
 if(result.error&&result.error.code!=="23505")console.error("Booking funnel event save failed",{businessId:input.businessId,event:input.event,code:result.error.code});
 return result;
}

export async function snapshotBookingAttribution(db:SupabaseClient,input:{businessId:string;bookingId:string;sessionId?:string|null}){
 if(!validSessionId(input.sessionId))return;
 const {data:session,error}=await db.from("booking_attribution_sessions").select("id,first_landing_url,first_landing_path,first_referrer,gclid,gbraid,wbraid,fbclid,utm_source,utm_medium,utm_campaign,utm_content,utm_term").eq("business_id",input.businessId).eq("id",input.sessionId).maybeSingle();
 if(error||!session)return;
 await db.from("booking_attribution_snapshots").upsert({booking_id:input.bookingId,business_id:input.businessId,attribution_session_id:session.id,first_landing_url:session.first_landing_url,first_landing_path:session.first_landing_path,first_referrer:session.first_referrer,gclid:session.gclid,gbraid:session.gbraid,wbraid:session.wbraid,fbclid:session.fbclid,utm_source:session.utm_source,utm_medium:session.utm_medium,utm_campaign:session.utm_campaign,utm_content:session.utm_content,utm_term:session.utm_term,updated_at:new Date().toISOString()},{onConflict:"booking_id"});
}

export function attributionFromSearch(search:URLSearchParams,fallback?:URLSearchParams):AttributionValues { return Object.fromEntries(attributionKeys.map(key=>[key,clean(search.get(key))||clean(fallback?.get(key))]).filter(([,value])=>Boolean(value))) as AttributionValues; }
