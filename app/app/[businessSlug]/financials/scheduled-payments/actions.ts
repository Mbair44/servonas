"use server";

import {redirect} from "next/navigation";
import {canManageCustomers} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";
import {processCompletedJobBilling} from "@/lib/financial/recurringBilling";

const destination=(slug:string,kind:"success"|"error",message:string)=>`/app/${slug}/financials/scheduled-payments?${kind}=${encodeURIComponent(message)}`;

/** Manual retry deliberately enters the same idempotent billing function used by the cron worker. */
export async function retryScheduledPayment(slug:string,bookingId:string){
 const {supabase,business,role}=await requireWorkspace(slug);
 if(!canManageCustomers(role))redirect(destination(slug,"error","You do not have permission to retry payments."));
 const {data:booking}=await supabase.from("bookings").select("id,job_id,status,balance_due_cents,customers(first_name,last_name)").eq("id",bookingId).eq("business_id",business.id).maybeSingle();
 if(!booking?.job_id)redirect(destination(slug,"error","This scheduled payment is unavailable."));
 const status=String(booking.status??"").toLowerCase();
 if(["cancelled","canceled","expired","refunded"].includes(status))redirect(destination(slug,"error","This booking cannot accept another payment."));
 if(Number(booking.balance_due_cents??0)<=0)redirect(destination(slug,"success","This booking is already paid."));
 const {data:job}=await supabase.from("jobs").select("status").eq("id",booking.job_id).eq("business_id",business.id).maybeSingle();
 if(job?.status!=="completed")redirect(destination(slug,"error","Automatic balance payment is available after the job is completed."));
 const result=await processCompletedJobBilling(String(booking.job_id),{force:true});
 if(!result.ok)redirect(destination(slug,"error","The payment could not be retried. Review the payment details below."));
 redirect(destination(slug,result.action==="paid"?"success":"error",result.action==="paid"?"Payment succeeded.":"The payment failed. Review the payment details below."));
}
