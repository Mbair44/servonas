"use server";
import {redirect} from "next/navigation";
import {canManageCustomers} from "@/lib/access";
import {processCompletedJobBilling} from "@/lib/financial/recurringBilling";
import {requireWorkspace} from "@/lib/workspace";

const destination=(slug:string,kind:"success"|"error",message:string)=>`/app/${slug}/invoices/receivables?${kind}=${encodeURIComponent(message)}`;

export async function rescheduleBookingBalance(slug:string,bookingId:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspace(slug);
 if(!canManageCustomers(role))redirect(destination(slug,"error","You do not have permission to reschedule payments."));
 const date=String(formData.get("scheduledFor")??"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))redirect(destination(slug,"error","Choose a valid charge date."));
 const scheduled=new Date(`${date}T12:00:00.000Z`);
 if(scheduled.getTime()<new Date().setUTCHours(0,0,0,0))redirect(destination(slug,"error","The charge date cannot be in the past."));
 const {error}=await supabase.rpc("reschedule_booking_balance_charge",{p_business_id:business.id,p_booking_id:bookingId,p_scheduled_for:scheduled.toISOString()});
 if(error){console.error("Booking balance reschedule failed",{businessId:business.id,bookingId,code:error.code});redirect(destination(slug,"error","The payment could not be rescheduled."));}
 redirect(destination(slug,"success","Payment rescheduled."));
}

export async function chargeBookingBalanceNow(slug:string,bookingId:string){
 const {supabase,business,role}=await requireWorkspace(slug);
 if(!canManageCustomers(role))redirect(destination(slug,"error","You do not have permission to charge payments."));
 const {data:booking}=await supabase.from("bookings").select("job_id,balance_due_cents,final_payment_authorized_at,stripe_customer_id,stripe_payment_method_id").eq("id",bookingId).eq("business_id",business.id).maybeSingle();
 if(!booking?.job_id||Number(booking.balance_due_cents)<=0||!booking.final_payment_authorized_at||!booking.stripe_customer_id||!booking.stripe_payment_method_id)redirect(destination(slug,"error","This booking does not have an authorized automatic balance payment."));
 const {data:job}=await supabase.from("jobs").select("status").eq("id",booking.job_id).eq("business_id",business.id).maybeSingle();
 if(job?.status!=="completed")redirect(destination(slug,"error","Charge now is available after the job is completed."));
 const {error:scheduleError}=await supabase.rpc("reschedule_booking_balance_charge",{p_business_id:business.id,p_booking_id:bookingId,p_scheduled_for:new Date().toISOString()});
 if(scheduleError)redirect(destination(slug,"error","The charge could not be started."));
 const result=await processCompletedJobBilling(String(booking.job_id));
 redirect(destination(slug,result.ok?"success":"error",result.ok?(result.action==="paid"?"Balance charged successfully.":result.action==="payment_failed"?"The charge failed. Review the payment details below.":"Balance charge started."):"The charge could not be started."));
}
