import {addRentalItemsToBooking,type RentalItemAddition} from "@/lib/bookingManage/addRentalItems";
import {stripeClient} from "@/lib/stripeConnect";

type AdminDb=any;

export function incrementalDepositCents(input:{newTotalCents:number;amountPaidCents:number;depositPercent:number}){
 const required=Math.round(Math.max(0,input.newTotalCents)*Math.min(100,Math.max(0,input.depositPercent))/100);
 return Math.max(0,required-Math.max(0,input.amountPaidCents));
}

/** Server-only staging entrypoint. `pricingSnapshot` and `newTotals` must be produced
 * by the authoritative booking pricing service, never from browser values. */
export async function stageBookingItemAmendment(db:AdminDb,input:{businessId:string;bookingId:string;items:RentalItemAddition[];pricingSnapshot:Record<string,unknown>;oldTotals:Record<string,unknown>;newTotals:Record<string,unknown>;depositPercent:number;amountPaidCents:number;idempotencyKey:string;expiresAt:Date;successUrl:string;cancelUrl:string}){
 const requiredPaymentCents=incrementalDepositCents({newTotalCents:Number(input.newTotals.total_cents??0),amountPaidCents:input.amountPaidCents,depositPercent:input.depositPercent});
 const {data:amendmentId,error:holdError}=await db.rpc("create_booking_item_amendment_hold",{p_business_id:input.businessId,p_booking_id:input.bookingId,p_requested_items:input.items,p_pricing_snapshot:input.pricingSnapshot,p_old_totals:input.oldTotals,p_new_totals:input.newTotals,p_required_payment_cents:requiredPaymentCents,p_idempotency_key:input.idempotencyKey,p_expires_at:input.expiresAt.toISOString()});
 if(holdError||!amendmentId)throw new Error(holdError?.message||"The requested rentals could not be held.");
 if(requiredPaymentCents===0){await applyPaidBookingItemAmendment(db,{amendmentId,paymentReference:null,checkoutSessionId:null,amountPaidCents:0});return {amendmentId,requiredPaymentCents,checkoutUrl:null};}
 const {data:account,error:accountError}=await db.from("business_payment_accounts").select("provider_account_id,charges_enabled").eq("business_id",input.businessId).eq("provider","stripe").maybeSingle();
 if(accountError||!account?.provider_account_id||!account.charges_enabled)throw new Error("Online payments are unavailable; the inventory hold will expire.");
 const session=await stripeClient().checkout.sessions.create({mode:"payment",line_items:[{quantity:1,price_data:{currency:"usd",unit_amount:requiredPaymentCents,product_data:{name:"Required deposit for booking update"}}}],success_url:input.successUrl,cancel_url:input.cancelUrl,expires_at:Math.floor(input.expiresAt.getTime()/1000),metadata:{booking_id:input.bookingId,business_id:input.businessId,amendment_id:String(amendmentId),payment_kind:"booking_item_amendment"}},{stripeAccount:account.provider_account_id});
 const {error:sessionError}=await db.from("booking_amendments").update({stripe_checkout_session_id:session.id}).eq("id",amendmentId).eq("business_id",input.businessId);
 if(sessionError||!session.url)throw new Error("Checkout could not be started; the inventory hold will expire.");
 return {amendmentId,requiredPaymentCents,checkoutUrl:session.url};
}

/** Applies a paid staged amendment. Call only from the Stripe webhook/recovery worker. */
export async function applyPaidBookingItemAmendment(db:AdminDb,input:{amendmentId:string;paymentReference:string|null;checkoutSessionId:string|null;amountPaidCents:number}){
 const {data:amendment,error:amendmentError}=await db.from("booking_amendments")
  .select("id,business_id,booking_id,requested_items,idempotency_key,required_payment_cents,status,expires_at")
  .eq("id",input.amendmentId).maybeSingle();
 if(amendmentError||!amendment)throw new Error("Staged booking amendment was not found.");
 if(amendment.status==="applied")return {applied:false,duplicate:true};
 if(amendment.status==="expired"||amendment.status==="cancelled"||new Date(amendment.expires_at)<=new Date())throw new Error("Staged booking amendment has expired.");
 if(Number(input.amountPaidCents)!==Number(amendment.required_payment_cents))throw new Error("Staged amendment payment amount did not match.");
 const {error:claimError}=await db.from("booking_amendments").update({status:"payment_processing",paid_at:new Date().toISOString(),stripe_payment_intent_id:input.paymentReference,stripe_checkout_session_id:input.checkoutSessionId}).eq("id",amendment.id).in("status",["pending_payment","payment_processing"]);
 if(claimError)throw new Error("Staged amendment could not be claimed.");
 try{
  const {data:before}=await db.from("bookings").select("balance_charge_scheduled_for").eq("id",amendment.booking_id).eq("business_id",amendment.business_id).maybeSingle();
  if(Number(input.amountPaidCents)>0){const {error}=await db.rpc("apply_customer_balance_payment",{p_business_id:amendment.business_id,p_booking_id:amendment.booking_id,p_payment_reference:input.paymentReference??input.checkoutSessionId,p_amount_cents:input.amountPaidCents,p_checkout_session_id:input.checkoutSessionId});if(error)throw error;}
  const result=await addRentalItemsToBooking(db,{businessId:amendment.business_id,bookingId:amendment.booking_id,items:amendment.requested_items as RentalItemAddition[],idempotencyKey:`amendment:${amendment.id}`,amendmentId:amendment.id});
  if(before?.balance_charge_scheduled_for){await db.from("bookings").update({balance_charge_scheduled_for:before.balance_charge_scheduled_for}).eq("id",amendment.booking_id).eq("business_id",amendment.business_id).gt("balance_due_cents",0);}
  const {error:completeError}=await db.from("booking_amendments").update({status:"applied",applied_at:new Date().toISOString(),failure_reason:null}).eq("id",amendment.id);
  if(completeError)throw completeError;
  return {applied:true,duplicate:false,result};
 }catch(error){
  await db.from("booking_amendments").update({status:"application_failed",failure_reason:error instanceof Error?error.message.slice(0,500):"application failed"}).eq("id",amendment.id);
  throw error;
 }
}
