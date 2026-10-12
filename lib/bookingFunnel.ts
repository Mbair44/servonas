import type {SupabaseClient} from "@supabase/supabase-js";

export const bookingFunnelEvents=["promotion_landing_view","promotion_primary_cta_clicked","booking_date_selection_started","booking_date_selected","promotion_inventory_viewed","promotion_item_selected","promotion_no_inventory_available","initiate_checkout","purchase","landing_page_view","inventory_item_view","inventory_item_clicked","check_availability_clicked","availability_date_selected","booking_started","customer_info_started","customer_info_entered","customer_info_completed","delivery_address_completed","delivery_fee_presented","final_price_presented","delivery_quote_failed","delivery_address_ineligible","terms_accepted","payment_cta_clicked","payment_started","payment_succeeded","checkout_started","checkout_addons_viewed","checkout_addons_skipped","checkout_addons_added","reservation_details_viewed","booking_completed","booking_confirmed","availability_check_started","event_date_selected","available_inventory_viewed","rental_viewed","rental_availability_checked","rental_available","rental_unavailable","reserve_clicked","item_added_to_cart","event_date_changed","unavailable_alternative_clicked","landing_view","service_view","inventory_view","booking_cta_click","availability_check","date_selected","lead_submitted","payment_completed","session_heartbeat","link_click","button_click","phone_click","sms_click","email_click","form_start","form_submit","product_service_selection","delivery_address_entered","delivery_distance_calculated","delivery_fee_calculated","outside_service_area","delivery_quote_requested","delivery_fee_overridden"] as const;
export type BookingFunnelEvent=typeof bookingFunnelEvents[number];
export const bookingFunnelEventGroups={
 promotionLanding:["promotion_landing_view"],
 checkout:["checkout_started","initiate_checkout"],
 booking:["booking_completed"],
 purchase:["purchase","payment_completed"],
} as const satisfies Record<string,readonly BookingFunnelEvent[]>;
export const metaCampaignTrafficEventNames=[...bookingFunnelEventGroups.promotionLanding,...bookingFunnelEventGroups.checkout,...bookingFunnelEventGroups.booking,...bookingFunnelEventGroups.purchase] as BookingFunnelEvent[];
export const attributionKeys=["gclid","gbraid","wbraid","fbclid","utm_source","utm_medium","utm_campaign","utm_content","utm_term","utm_id"] as const;
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

const configuredAttributionLookbackDays=Number(process.env.MARKETING_ATTRIBUTION_LOOKBACK_DAYS);
export const defaultAttributionLookbackDays=Number.isFinite(configuredAttributionLookbackDays)&&configuredAttributionLookbackDays>=1&&configuredAttributionLookbackDays<=365?Math.floor(configuredAttributionLookbackDays):30;
export async function snapshotBookingAttribution(db:SupabaseClient,input:{businessId:string;bookingId:string;sessionId?:string|null;lookbackDays?:number}){
 const lookbackDays=Math.max(1,Math.min(365,Math.floor(input.lookbackDays??defaultAttributionLookbackDays)));
 if(!validSessionId(input.sessionId)){
  const result=await db.from("booking_attribution_snapshots").insert({booking_id:input.bookingId,business_id:input.businessId,attribution_lookback_days:lookbackDays,attribution_status:"unknown",updated_at:new Date().toISOString()});
  if(result.error&&result.error.code!=="23505")console.error("Booking attribution snapshot save failed",{businessId:input.businessId,bookingId:input.bookingId,code:result.error.code});
  return;
 }
 const {data:session,error}=await db.from("booking_attribution_sessions").select("id,first_landing_url,first_landing_path,first_referrer,gclid,gbraid,wbraid,fbclid,utm_source,utm_medium,utm_campaign,utm_content,utm_term,utm_id,visitor_id").eq("business_id",input.businessId).eq("id",input.sessionId).maybeSingle();
 if(error||!session)return;
 const {data:visitor}=validSessionId(session.visitor_id)?await db.from("booking_attribution_visitors").select("first_touch,last_touch,last_non_direct_touch,last_seen_at").eq("business_id",input.businessId).eq("visitor_id",session.visitor_id).maybeSingle():{data:null};
 const eligible=(touch:unknown)=>{if(!touch||typeof touch!=="object")return null;const occurred=(touch as {occurred_at?:unknown}).occurred_at;if(typeof occurred!=="string"||Number.isNaN(Date.parse(occurred))||Date.now()-Date.parse(occurred)>lookbackDays*86_400_000)return null;return touch;};
 const firstTouch=eligible(visitor?.first_touch),lastTouch=eligible(visitor?.last_touch),lastNonDirectTouch=eligible(visitor?.last_non_direct_touch);
 const status=firstTouch||lastTouch?"known":session.visitor_id?"expired":"consent_unavailable";
 const result=await db.from("booking_attribution_snapshots").insert({booking_id:input.bookingId,business_id:input.businessId,attribution_session_id:session.id,visitor_id:session.visitor_id??null,first_landing_url:session.first_landing_url,first_landing_path:session.first_landing_path,first_referrer:session.first_referrer,gclid:session.gclid,gbraid:session.gbraid,wbraid:session.wbraid,fbclid:session.fbclid,utm_source:session.utm_source,utm_medium:session.utm_medium,utm_campaign:session.utm_campaign,utm_content:session.utm_content,utm_term:session.utm_term,utm_id:session.utm_id,first_touch:firstTouch,last_touch:lastTouch,last_non_direct_touch:lastNonDirectTouch,attribution_lookback_days:lookbackDays,attribution_status:status,updated_at:new Date().toISOString()});
 if(result.error&&result.error.code!=="23505")console.error("Booking attribution snapshot save failed",{businessId:input.businessId,bookingId:input.bookingId,code:result.error.code});
}

/**
 * Google Ads can append `gad_campaignid` alongside a click ID when auto-tagging
 * is enabled.  Store it in the existing canonical campaign-ID field rather
 * than requiring every advertiser to add duplicate UTM parameters.
 */
export function attributionFromSearch(search:URLSearchParams,fallback?:URLSearchParams):AttributionValues {
 const valueFor=(key:string)=>clean(search.get(key))||clean(fallback?.get(key));
 const attribution=Object.fromEntries(attributionKeys.map(key=>[key,valueFor(key)]).filter(([,value])=>Boolean(value))) as AttributionValues;
 if(!attribution.utm_id){
  const googleCampaignId=valueFor("gad_campaignid");
  if(googleCampaignId)attribution.utm_id=googleCampaignId;
 }
 return attribution;
}

export type BookingSessionState = { sessionId: string; attribution: AttributionValues; landingUrl: string; referrer: string; lastSessionSyncAt?: number; linkedSessionId?: string };

/** Explicit new campaign arrivals start a session; reloads and untagged navigation retain it. */
export function resolveBookingSession(existing: BookingSessionState | null, url: string, referrer: string, newId: () => string, initialSessionId?: string): BookingSessionState {
 const current = new URL(url);
 const direct = attributionFromSearch(current.searchParams);
 const changed = existing && Object.entries(direct).some(([key, value]) => existing.attribution?.[key as keyof AttributionValues] !== value);
 const linkedId = initialSessionId || current.searchParams.get("sv_at");
 if (existing && validSessionId(existing.sessionId) && !changed) {
  // Continue explicit links across public-site / embedded-booking origins.
  // Remember a consumed link so a stale sv_at cannot undo a new campaign arrival.
  if (validSessionId(linkedId) && linkedId !== existing.linkedSessionId) return {...existing, sessionId: linkedId!, linkedSessionId: linkedId!, lastSessionSyncAt: 0};
  return existing;
 }
 let fallback: URLSearchParams | undefined;
 try { fallback = referrer ? new URL(referrer).searchParams : undefined; } catch { /* Invalid referrer. */ }
 return { sessionId: validSessionId(linkedId) && (!changed || linkedId !== existing?.sessionId) ? linkedId! : newId(), ...(validSessionId(linkedId) ? {linkedSessionId:linkedId!} : {}), attribution: Object.keys(direct).length ? direct : attributionFromSearch(current.searchParams, fallback), landingUrl: url, referrer, lastSessionSyncAt: 0 };
}

/** Guarantee the parent before snapshot/events, even when the browser beacon was lost. */
export async function ensureCheckoutAttributionSession(db: SupabaseClient, businessId: string, sessionId: unknown, attribution: unknown): Promise<string | null> {
 if (!validSessionId(sessionId)) return null;
 const values = attribution && typeof attribution === "object" ? attribution as Record<string, unknown> : {};
 const patch: Record<string, unknown> = {page_increment: 0, engaged_page_increment: 0};
 for (const key of attributionKeys) patch[key] = clean(values[key]) || null;
 const {error} = await db.rpc("upsert_booking_attribution_session", {p_business_id: businessId, p_session_id: sessionId, p_patch: patch});
 if (error) { console.warn("Checkout attribution session unavailable", {businessId, code: error.code}); return null; }
 return sessionId as string;
}
