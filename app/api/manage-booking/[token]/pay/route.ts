import {NextResponse} from "next/server";
import Stripe from "stripe";
import {resolveBookingManageToken} from "@/lib/bookingManage/tokens";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {persistPaymentAllocation,associatePaymentAllocationCheckout} from "@/lib/pricing/persistPaymentAllocation";
import {combinedEligibleAllocation} from "@/lib/pricing/paymentAllocation";
import {getPricingProfile} from "@/lib/pricing/profile";
import {preparePlatformFee} from "@/lib/pricing/platformFeeEngine";

export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 const {token}=await params,access=await resolveBookingManageToken(token),db=getSupabaseAdmin(),key=process.env.STRIPE_SECRET_KEY;
 if(!access||!db||!key)return NextResponse.json({error:"This payment link is unavailable."},{status:404});
 const body=await request.json().catch(()=>null),authorizeFutureBalance=body?.authorizeFutureBalance===true;
 const {data:b,error}=await db.from("bookings").select("id,business_id,booking_number,balance_due_cents,deposit_cents,amount_paid_cents,total_cents,payment_request_expires_at,payment_request_never_expires,status").eq("id",access.booking_id).eq("business_id",access.business_id).maybeSingle();
 if(error||!b)return NextResponse.json({error:"This booking cannot accept payments."},{status:404});
 const requestDeposit=b.status==="pending_payment"&&(b.payment_request_expires_at!=null||b.payment_request_never_expires===true);
 if(requestDeposit&&b.payment_request_expires_at&&new Date(b.payment_request_expires_at)<=new Date())return NextResponse.json({error:"This payment request has expired."},{status:409});
 if(requestDeposit&&!authorizeFutureBalance)return NextResponse.json({error:"Please authorize the remaining-balance charge before paying your deposit."},{status:409});
 const amount=requestDeposit?Math.max(0,Number(b.deposit_cents)-Number(b.amount_paid_cents)):Number(b.balance_due_cents);
 if(amount<=0)return NextResponse.json({error:"No balance is due."},{status:409});
 if(!["pending_payment","paid","confirmed","completed"].includes(b.status))return NextResponse.json({error:"This booking cannot accept payments."},{status:409});
 const {data:account}=await db.from("business_payment_accounts").select("provider_account_id,charges_enabled").eq("business_id",b.business_id).eq("provider","stripe").maybeSingle();
 if(!account?.provider_account_id||!account.charges_enabled)return NextResponse.json({error:"Online payments are temporarily unavailable. Please contact us."},{status:503});
 try{
  const suppliedAttemptKey=typeof body?.paymentAttemptKey==="string"&&/^[A-Za-z0-9_-]{16,120}$/.test(body.paymentAttemptKey)?body.paymentAttemptKey:null,profile=await getPricingProfile(db,b.business_id);
  if(profile.planKey!=="legacy"&&profile.rolloutEnabled&&!suppliedAttemptKey)return NextResponse.json({error:"This payment attempt could not be verified. Refresh and try again."},{status:409});
  const attemptKey=suppliedAttemptKey??crypto.randomUUID();
  const allocation=await persistPaymentAllocation(db,{businessId:b.business_id,paymentKey:`manage:${b.id}:${attemptKey}`,sourceReference:`booking:${b.id}`,allocation:combinedEligibleAllocation(requestDeposit?"booking_deposit":"booking_balance",amount,"USD")});
  const fee=await preparePlatformFee(db,{businessId:b.business_id,idempotencyKey:`manage:${b.id}:${attemptKey}`,allocation:{eligibleAmountCents:amount,excludedAmountCents:0,reason:"allocation_v1"},expiresAt:new Date(Date.now()+30*60_000).toISOString()});
  const session=await new Stripe(key).checkout.sessions.create({mode:"payment",customer_creation:requestDeposit?"always":undefined,line_items:[{quantity:1,price_data:{currency:"usd",unit_amount:amount,product_data:{name:requestDeposit?`Required rental deposit · Booking #${b.booking_number}`:`Remaining balance · Booking #${b.booking_number}`}}}],success_url:`${process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3000"}/manage-booking/${token}?payment=processing`,cancel_url:`${process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3000"}/manage-booking/${token}?payment=cancelled`,metadata:{booking_id:b.id,business_id:b.business_id,payment_kind:requestDeposit?"rental_deposit_request":"customer_balance",total_cents:String(b.total_cents),deposit_cents:String(amount),...(fee.reservationId?{servonas_fee_reservation_id:fee.reservationId}:{}),...(requestDeposit?{final_payment_authorized:"true",final_payment_authorized_at:new Date().toISOString(),final_payment_authorization_version:"assisted_rental_v1"}:{})},payment_intent_data:{setup_future_usage:"off_session",...(fee.applicationFeeCents?{application_fee_amount:fee.applicationFeeCents,metadata:{servonas_fee_reservation_id:fee.reservationId!}}:{})}},{stripeAccount:account.provider_account_id,idempotencyKey:`manage:${b.id}:${attemptKey}`});
  await associatePaymentAllocationCheckout(db,{allocationId:allocation?.id??null,businessId:b.business_id,checkoutSessionId:session.id});
  if(requestDeposit)await db.from("bookings").update({stripe_checkout_session_id:session.id}).eq("id",b.id).eq("status","pending_payment");
  await db.from("booking_change_audit").insert({booking_id:b.id,business_id:b.business_id,change_source:"customer",change_type:"balance_payment_started",new_values:{amount_cents:amount,final_payment_authorized:requestDeposit},payment_reference:session.id,resulting_balance_due_cents:b.balance_due_cents});
  return NextResponse.json({checkoutUrl:session.url});
 }catch{return NextResponse.json({error:"We couldn't start your payment. Please try again."},{status:502});}
}
