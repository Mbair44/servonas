"use server";
import {requireWorkspaceCapability} from "@/lib/workspace";
import {canManageCustomers} from "@/lib/access";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {ensureRentalBookingJob} from "@/lib/rentalBookingJob";
import {createRentalDepositPaymentRequest} from "@/lib/communications/rentalPaymentRequest";
import {STAFF_BOOKING_SMS_CONSENT_VERSION,webBookingSmsConsentDisclosure} from "@/lib/smsConsent";
import {assistedMoneyCents,assistedRentalTotals,normalizeAssistedRentalLines,type AssistedRentalLine} from "@/lib/assistedRentalItems";
const text=(f:FormData,k:string)=>String(f.get(k)??"").trim();
export async function createEmergencyAssistedBooking(slug:string,form:FormData):Promise<{error?:string;url?:string}>{
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"job_management");
 if(!canManageCustomers(role)||business.industry_profile!=="party_rental")return {error:"Not authorized."};
 // Elevated RPC is used only after workspace authorization and explicit tenant validation.
 const db=getSupabaseAdmin();if(!db)return {error:"Booking service is unavailable."};
 let created:{booking_id:string;booking_number:number}|null=null;
 try{
  const {data:inventory,error:inventoryError}=await supabase.from("inventory_items").select("id,name,daily_price_cents,allow_quantity,stock_quantity").eq("business_id",business.id).eq("active",true);
  if(inventoryError)throw new Error("Rental inventory could not be loaded.");
  const lines=normalizeAssistedRentalLines(JSON.parse(text(form,"rentalItems")) as AssistedRentalLine[],inventory??[]);
  const amounts={discount:assistedMoneyCents(text(form,"discount")),delivery:assistedMoneyCents(text(form,"delivery")),tax:assistedMoneyCents(text(form,"tax")),deposit:assistedMoneyCents(text(form,"deposit")),...(text(form,"overrideSubtotal")==="true"?{subtotalOverride:assistedMoneyCents(text(form,"subtotal"))}:{})};
  const totals=assistedRentalTotals(lines,amounts);if(totals.deposit<=0)throw new Error("Enter a deposit greater than zero to create a payment link.");
  const date=text(form,"rentalDate"),requestKey=text(form,"requestKey");
  let first=text(form,"firstName"),last=text(form,"lastName"),email=text(form,"email"),phone=text(form,"phone");
  const customerId=text(form,"existingCustomer");
  if(customerId){
   const {data:customer,error}=await supabase.from("customers").select("first_name,last_name,email,phone").eq("id",customerId).eq("business_id",business.id).eq("is_deleted",false).maybeSingle();
   if(error||!customer)throw new Error("Customer not found.");
   first=customer.first_name??"";last=customer.last_name??"";email=customer.email??"";phone=customer.phone??"";
  }
  const address=text(form,"address"),city=text(form,"city"),zip=text(form,"zip");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T12:00:00Z`))||new Date(`${date}T12:00:00Z`)<new Date(new Date().toDateString())||!first||!last||!email||!phone||!address||!zip||!requestKey)throw new Error("Complete all required fields.");
  const {data,error}=await db.rpc("create_assisted_rental_booking",{p_business_id:business.id,p_request_key:requestKey,p_items:lines,p_details:{rentalDate:date,firstName:first,lastName:last,email,phone,address,city,zip,...amounts,smsConsent:text(form,"smsConsent")==="true",smsDisclosure:webBookingSmsConsentDisclosure(business.name),smsDisclosureVersion:STAFF_BOOKING_SMS_CONSENT_VERSION}});
  if(error)throw new Error(error.message);
  created=Array.isArray(data)?data[0]:data;
  if(!created?.booking_id)throw new Error("Booking could not be created.");
 }catch(error){return {error:error instanceof Error?error.message:"Booking could not be created."};}
 try{
  await ensureRentalBookingJob(db,created.booking_id);
  const request=await createRentalDepositPaymentRequest(created.booking_id);
  return {url:`/app/${slug}/jobs?success=${encodeURIComponent(`Booking #${created.booking_number} held until ${new Date(request.expiresAt).toLocaleString()}. Payment link ${request.smsSent?"sent by SMS":"created"}.`)}`};
 }catch{
  return {error:`Booking #${created.booking_number} is held, but its payment link could not be completed. Retry this form to continue the same booking, or open Jobs to review it.`};
 }
}
