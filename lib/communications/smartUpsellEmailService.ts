import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {rentalEmailDeliveryIsLive} from "@/lib/emailDeliveryMode";

const esc=(value:string)=>value.replace(/[&<>\"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]!));
const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Math.max(0,cents||0)/100);

/** Notify the business only after its Smart Upsell amendment has been applied.
 * Resend's idempotency key makes webhook retries safe without coupling this
 * operational notification to the already-confirmed booking email. */
export async function sendSmartUpsellBusinessNotification(input:{businessId:string;bookingId:string;offerId:string;amendmentId:string;amountPaidCents:number}){
 const db=getSupabaseAdmin();if(!db)return {ok:false,error:"Supabase is unavailable."};
 const [{data:booking,error:bookingError},{data:offer,error:offerError}]=await Promise.all([
  db.from("bookings").select("booking_number,total_cents,balance_due_cents,businesses(name,email,owner_user_id),customers(first_name,last_name,email,phone)").eq("id",input.bookingId).eq("business_id",input.businessId).maybeSingle(),
  db.from("smart_upsell_offers").select("id,inventory_item_id,discounted_price_cents,tax_cents,inventory_items(name)").eq("id",input.offerId).eq("business_id",input.businessId).eq("booking_id",input.bookingId).eq("status","accepted").maybeSingle(),
 ]);
 if(bookingError||!booking)return {ok:false,error:"Booking details are unavailable."};
 if(offerError||!offer)return {ok:false,error:"Smart Upsell details are unavailable."};
 const business=Array.isArray(booking.businesses)?booking.businesses[0]:booking.businesses;
 const customer=Array.isArray(booking.customers)?booking.customers[0]:booking.customers;
 const {data:ownerProfile}=business?.owner_user_id?await db.from("profiles").select("email").eq("id",business.owner_user_id).maybeSingle():{data:null};
 const recipient=business?.email?.trim()||ownerProfile?.email?.trim();if(!recipient)return {ok:true,skipped:true};
 const item=Array.isArray(offer.inventory_items)?offer.inventory_items[0]:offer.inventory_items;
 const customerName=[customer?.first_name,customer?.last_name].filter(Boolean).join(" ")||"Customer";
 const upsellTotal=Number(offer.discounted_price_cents)+Number(offer.tax_cents);
 const lines=[
  "A customer added a Smart Upsell to an existing party-rental booking.",
  `Confirmation: #${booking.booking_number}`,
  `Customer: ${customerName}`,
  customer?.email?`Email: ${customer.email}`:null,
  customer?.phone?`Phone: ${customer.phone}`:null,
  `Added rental: ${item?.name??"Rental item"}`,
  `Smart Upsell total: ${money(upsellTotal)}`,
  `Paid today: ${money(input.amountPaidCents)}`,
  `Updated booking total: ${money(Number(booking.total_cents))}`,
  `Updated balance due: ${money(Number(booking.balance_due_cents))}`,
 ].filter((line):line is string=>Boolean(line));
 const text=[...lines,"Open Servonas to view the updated booking."].join("\n\n");
 if(!rentalEmailDeliveryIsLive())return {ok:true,stubbed:true};
 const key=process.env.RESEND_API_KEY?.trim(),configuredFrom=process.env.EMAIL_FROM?.trim();
 if(!key||!configuredFrom)return {ok:false,error:"Resend is not configured."};
 const sendingAddress=configuredFrom.match(/<([^>]+)>/)?.[1]??configuredFrom;
 const businessName=(business?.name||"Service business").replace(/[\r\n<>]/g,"").trim();
 try{
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","Idempotency-Key":`smart-upsell/${input.offerId}`},body:JSON.stringify({from:`${businessName} bookings <${sendingAddress}>`,to:[recipient],...(customer?.email?{reply_to:customer.email}:{}),subject:`Smart Upsell added to reservation #${booking.booking_number} — ${customerName}`,text,html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>Smart Upsell added</h2>${lines.map(line=>`<p>${esc(line)}</p>`).join("")}<p>Open Servonas to view the updated booking.</p></div>`})});
  const result=await response.json() as {id?:string;message?:string};
  if(!response.ok||!result.id)throw new Error(result.message||`Resend HTTP ${response.status}`);
  console.info("Smart Upsell business notification email sent",{businessId:input.businessId,bookingId:input.bookingId,offerId:input.offerId,messageId:result.id});
  return {ok:true,messageId:result.id};
 }catch(error){const message=error instanceof Error?error.message:"Email failed";console.error("Smart Upsell business notification email failed",{businessId:input.businessId,bookingId:input.bookingId,offerId:input.offerId,message});return {ok:false,error:message};}
}
