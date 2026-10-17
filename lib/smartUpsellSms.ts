import {hashSmartUpsellToken,smartUpsellTokenIsUsable,validateSmartUpsellSettings} from "./smartUpsells.ts";
import {createSmartUpsellOfferFromCandidate,dryRunSmartUpsellCandidates,isWithinSmsSendWindow} from "./smartUpsellCandidates.ts";
import {smartUpsellCheckoutPreparationEnabled} from "./smartUpsellCheckout.ts";

type Db=any;
export const smartUpsellAutomatedSmsEnabled=()=>process.env.SMART_UPSELL_AUTOMATED_SMS_ENABLED==="true";
/** Sending requires the same validated checkout gate as accepting an offer. */
export const smartUpsellAutomationReady=()=>smartUpsellAutomatedSmsEnabled()&&smartUpsellCheckoutPreparationEnabled();
/** All three server-only controls are required before an admin can activate a tenant. */
export const smartUpsellActivationEnabled=()=>smartUpsellAutomationReady()&&process.env.SMART_UPSELL_ADMIN_ACTIVATION_ENABLED==="true";
const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
const retryAt=(attempt:number)=>new Date(Date.now()+Math.min(60*60_000,Math.max(60_000,2**Math.min(attempt,6)*60_000))).toISOString();
const eventDay=(date:string,timezone:string)=>new Intl.DateTimeFormat("en-US",{timeZone:timezone,weekday:"long"}).format(new Date(date));

export function smartUpsellSmsBody(input:{firstName:string|null;eventStart:string;timezone:string;itemName:string;discountedPriceCents:number;originalPriceCents:number;offerLink:string;businessName:string}){
 return `Hey ${input.firstName?.trim()||"there"}! 🎉 We're getting everything ready for your party this ${eventDay(input.eventStart,input.timezone)}!\n\nWe have an extra ${input.itemName} available that day, and since we're already delivering to you, we'd love to offer it to you for 50% OFF!\n\nAdd our ${input.itemName} for just ${money(input.discountedPriceCents)} (normally ${money(input.originalPriceCents)}).\n\nInterested? Grab it here: ${input.offerLink}\n\n— ${input.businessName}\nReply STOP to opt out.`.slice(0,1600);
}
async function offerOrigin(db:Db,businessId:string){
 const [{data:site},{data:business}]=await Promise.all([db.from("business_website_settings").select("custom_domain,status,domain_status").eq("business_id",businessId).eq("status","published").eq("domain_status","connected").maybeSingle(),db.from("businesses").select("slug").eq("id",businessId).maybeSingle()]);
 if(site?.custom_domain)return `https://${String(site.custom_domain).replace(/^https?:\/\//,"").replace(/\/$/,"")}`;
 const root=(process.env.NEXT_PUBLIC_SITE_URL||process.env.NEXT_PUBLIC_APP_URL||"https://servonas.com").replace(/\/$/,"");
 return business?.slug?root:root;
}

/** Creates immutable offers and queue rows. It is never called by the dry run. */
export async function scheduleSmartUpsellOffers(db:Db,input:{now?:Date;limitBusinesses?:number}={}){
 if(!smartUpsellAutomationReady())return{disabled:true,reason:"checkout_unavailable",offersCreated:0,queued:0,failures:0};
 const now=input.now??new Date(),{data:settings,error}=await db.from("business_smart_upsell_settings").select("*").eq("enabled",true).limit(Math.min(Math.max(input.limitBusinesses??100,1),500));
 if(error)throw new Error("Smart Upsell settings could not be loaded.");let offersCreated=0,queued=0,failures=0;
 for(const setting of settings??[]){
  await db.from("smart_upsell_offers").update({status:"expired",expired_at:now.toISOString()}).eq("business_id",setting.business_id).in("status",["pending","sent","viewed","checkout_pending"]).lt("expires_at",now.toISOString());
  try{const rows=await dryRunSmartUpsellCandidates(db,{businessId:setting.business_id,now});for(const row of rows){if(!row.eligible||!row.selected)continue;
   const {data:booking}=await db.from("bookings").select("id,business_id,customer_id,rental_starts_at,rental_ends_at,customers(first_name,phone_normalized,phone,sms_consent_status,is_deleted),businesses(name,timezone)").eq("id",row.bookingId).eq("business_id",setting.business_id).maybeSingle();
   const customer=Array.isArray(booking?.customers)?booking?.customers[0]:booking?.customers,business=Array.isArray(booking?.businesses)?booking?.businesses[0]:booking?.businesses;
   if(!booking||!customer||customer.is_deleted||customer.sms_consent_status!=="express"||!booking.rental_starts_at||!booking.rental_ends_at)continue;
   const phone=customer.phone_normalized||customer.phone;if(!phone)continue;
   const {data:consent}=await db.from("customer_sms_consents").select("status").eq("business_id",setting.business_id).eq("phone_e164",phone).maybeSingle();
   if(consent?.status==="opted_out")continue;
   const smartSettings=validateSmartUpsellSettings({enabled:Boolean(setting.enabled),sendBeforeEventHours:Number(setting.send_before_event_hours),discountBasisPoints:Number(setting.discount_basis_points),depositBasisPoints:Number(setting.deposit_basis_points),offerExpirationHours:Number(setting.offer_expiration_hours),maxOffersPerBooking:Number(setting.max_offers_per_booking),additionalDeliveryFeeCents:Number(setting.additional_delivery_fee_cents),automaticSelection:Boolean(setting.automatic_selection),minimumDiscountedPriceCents:setting.minimum_discounted_price_cents==null?null:Number(setting.minimum_discounted_price_cents),smsSendWindowStartHour:Number(setting.sms_send_window_start_hour),smsSendWindowEndHour:Number(setting.sms_send_window_end_hour)});
   const created=await createSmartUpsellOfferFromCandidate(db,{businessId:setting.business_id,booking, candidate:row.selected,settings:smartSettings,requestKey:`smart-upsell:${booking.id}`,now});
   if(created.offer.token_hash!==hashSmartUpsellToken(created.token))continue; // concurrent scheduler created the durable offer; never send an unknown token.
   offersCreated++;
   const origin=await offerOrigin(db,setting.business_id),link=`${origin}/upsell/${created.token}`,body=smartUpsellSmsBody({firstName:customer.first_name??null,eventStart:booking.rental_starts_at,timezone:business?.timezone??"America/Phoenix",itemName:row.selected.name,discountedPriceCents:row.selected.price.discountedPriceCents,originalPriceCents:row.selected.price.originalPriceCents,offerLink:link,businessName:business?.name??"Your rental company"});
   const {error:queueError}=await db.from("smart_upsell_sms_deliveries").insert({business_id:setting.business_id,offer_id:created.offer.id,customer_id:booking.customer_id,phone_e164:phone,body,status:"queued",next_attempt_at:now.toISOString()});
   if(queueError&&queueError.code!=="23505"){await db.from("smart_upsell_offers").update({status:"failed",offer_metadata:{...(created.offer.offer_metadata??{}),queue_error:"delivery_queue_unavailable"}}).eq("id",created.offer.id).eq("business_id",setting.business_id).in("status",["pending"]);throw queueError;}if(!queueError)queued++;
  }}catch{failures++;}
 }
 return{disabled:false,offersCreated,queued,failures};
}

/** Rechecks consent, booking state, offer expiry, and tenant-local send window immediately before Twilio dispatch. */
export async function dispatchSmartUpsellSmsQueue(db:Db,input:{now?:Date;limit?:number}={}){
 if(!smartUpsellAutomationReady())return{disabled:true,reason:"checkout_unavailable",processed:0,sent:0,skipped:0,failed:0};const now=input.now??new Date();
 const {data:queue,error}=await db.from("smart_upsell_sms_deliveries").select("*").in("status",["queued","failed"]).lte("next_attempt_at",now.toISOString()).order("queued_at").limit(Math.min(Math.max(input.limit??100,1),500));if(error)throw new Error("Smart Upsell SMS queue is unavailable.");let processed=0,sent=0,skipped=0,failed=0;
 for(const row of queue??[]){processed++;
  // Recheck immediately before each dispatch so a gate change cannot send a stale queued offer.
  if(!smartUpsellAutomationReady()){await db.from("smart_upsell_sms_deliveries").update({status:"skipped",skipped_at:now.toISOString(),last_error:"Checkout validation gate is unavailable; SMS was not sent.",updated_at:now.toISOString()}).eq("id",row.id).in("status",["queued","failed"]);skipped++;continue;}
  const {data:claimed}=await db.from("smart_upsell_sms_deliveries").update({status:"sending",attempt_count:Number(row.attempt_count??0)+1,updated_at:now.toISOString()}).eq("id",row.id).eq("status",row.status).select("id").maybeSingle();if(!claimed)continue;
  try{const [{data:offer},{data:customer},{data:consent},{data:business},{data:settings}]=await Promise.all([
   db.from("smart_upsell_offers").select("id,status,expires_at,booking_id,business_id,customer_id").eq("id",row.offer_id).eq("business_id",row.business_id).maybeSingle(),
   db.from("customers").select("id,sms_consent_status,is_deleted").eq("id",row.customer_id).eq("business_id",row.business_id).maybeSingle(),
   db.from("customer_sms_consents").select("status").eq("business_id",row.business_id).eq("phone_e164",row.phone_e164).maybeSingle(),
   db.from("businesses").select("timezone").eq("id",row.business_id).maybeSingle(),
   db.from("business_smart_upsell_settings").select("enabled,sms_send_window_start_hour,sms_send_window_end_hour").eq("business_id",row.business_id).maybeSingle(),
  ]);
  // Reload the booking from the tenant-owned offer, not a queue-supplied identifier.
  const {data:offerBooking}=offer?await db.from("bookings").select("id,status,customer_id").eq("id",offer.booking_id).eq("business_id",row.business_id).maybeSingle():{data:null};
  const timeOk=Boolean(settings?.enabled)&&isWithinSmsSendWindow(now,business?.timezone??"America/Phoenix",Number(settings?.sms_send_window_start_hour??9),Number(settings?.sms_send_window_end_hour??20));
  if(!offer||!smartUpsellTokenIsUsable(offer,now)||!offerBooking||!["paid","confirmed"].includes(offerBooking.status)||offerBooking.customer_id!==row.customer_id||!customer||customer.is_deleted||customer.sms_consent_status!=="express"||consent?.status==="opted_out"||!timeOk){await db.from("smart_upsell_sms_deliveries").update({status:"skipped",skipped_at:now.toISOString(),last_error:"Offer, booking, consent, or sending window is no longer eligible.",updated_at:now.toISOString()}).eq("id",row.id).eq("status","sending");skipped++;continue;}
  const {sendTenantTwilioMessage}=await import("./twilio/messageUsage");const delivered=await sendTenantTwilioMessage({businessId:row.business_id,to:row.phone_e164,body:row.body,sourceType:"smart_upsell",sourceId:row.offer_id,customerId:row.customer_id});
  await db.from("smart_upsell_sms_deliveries").update({status:"sent",twilio_message_sid:delivered.sid,sent_at:now.toISOString(),last_error:null,updated_at:now.toISOString()}).eq("id",row.id).eq("status","sending");
  await db.from("smart_upsell_offers").update({sms_message_id:delivered.sid}).eq("id",row.offer_id).eq("business_id",row.business_id);
  await db.rpc("transition_smart_upsell_offer",{p_offer_id:row.offer_id,p_business_id:row.business_id,p_next_status:"sent",p_metadata:{sms_message_id:delivered.sid}});sent++;
  }catch(error){const message=error instanceof Error?error.message:"SMS dispatch failed.";const attempts=Number(row.attempt_count??0)+1,knownRetry=/\b(429|500|502|503|504)\b/.test(message);await db.from("smart_upsell_sms_deliveries").update({status:knownRetry&&attempts<3?"failed":"reconciliation_required",next_attempt_at:knownRetry&&attempts<3?retryAt(attempts):now.toISOString(),last_error:message.slice(0,500),failed_at:now.toISOString(),updated_at:now.toISOString()}).eq("id",row.id).eq("status","sending");failed++;}
 }
 return{disabled:false,processed,sent,skipped,failed};
}

export async function recordSmartUpsellSmsDeliveryStatus(db:Db,input:{businessId:string;messageSid:string;status:string}){
 const next=input.status==="delivered"?"delivered":["failed","undelivered"].includes(input.status)?"failed":null;if(!next)return false;
 const now=new Date().toISOString(),values=next==="delivered"?{status:next,delivered_at:now,updated_at:now}:{status:next,failed_at:now,last_error:`Twilio ${input.status}`,updated_at:now};
 const {data,error}=await db.from("smart_upsell_sms_deliveries").update(values).eq("business_id",input.businessId).eq("twilio_message_sid",input.messageSid).in("status",["sent","delivered","failed"]).select("id").maybeSingle();if(error)throw error;return Boolean(data);
}
