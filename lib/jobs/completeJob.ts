import {canTransitionJob,type JobStatus} from "../jobStatusTransitions.ts";
import {JobNotificationService} from "../communications/jobNotificationService.ts";
import {processCompletedJobBilling} from "../financial/recurringBilling.ts";

/** Shared completion workflow for UI/Assistant callers. The caller supplies an already authenticated tenant client. */
export async function completeJobWorkflow(input:{supabase:any;businessId:string;userId:string;jobId:string}){
 const {data:job,error}=await input.supabase.from("jobs").select("id,status,customer_id,title").eq("id",input.jobId).eq("business_id",input.businessId).eq("is_deleted",false).maybeSingle();
 if(error||!job)throw new Error("That job was not found in this workspace.");
 if(job.status==="completed"){
  const billing=await processCompletedJobBilling(job.id);
  if(!billing.ok||billing.action==="payment_failed")throw new Error("The job is complete, but its remaining payment needs office attention.");
  return{job,alreadyCompleted:true,billing};
 }
 if(!canTransitionJob(job.status as JobStatus,"completed"))throw new Error(`That job must follow the normal workflow before it can be completed. It is currently ${String(job.status).replaceAll("_"," ")}.`);
 const {error:updateError}=await input.supabase.from("jobs").update({status:"completed",work_completed_at:new Date().toISOString(),updated_by:input.userId}).eq("id",job.id).eq("business_id",input.businessId).eq("status",job.status).eq("is_deleted",false);
 if(updateError)throw new Error("The job status could not be updated.");
 await Promise.allSettled([JobNotificationService.jobCompleted(job.id),JobNotificationService.reviewRequest(job.id)]);
 const billing=await processCompletedJobBilling(job.id);
 if(!billing.ok||billing.action==="payment_failed")throw new Error("The job was completed, but its remaining payment needs office attention.");
 return{job:{...job,status:"completed"},alreadyCompleted:false,billing};
}
