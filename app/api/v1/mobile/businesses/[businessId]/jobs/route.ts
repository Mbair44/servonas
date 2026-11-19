import { mobileJobsListDataSchema, mobileJobsQuerySchema } from "@servonas/shared";
import { createMobileAuthorizationContext, MobileApiError, newMobileRequestId, requireMobileWorkspace } from "@/lib/mobileApi";
import { handleMobileApiError, mobileError, mobileSuccess } from "@/lib/mobileApiResponse";
import { mobileBusiness, mobileJobRangeBounds, requireOffice, summary } from "@/lib/mobileReadModels";

export const dynamic="force-dynamic";
const relation=<T,>(value:T|T[]|null|undefined)=>Array.isArray(value)?value[0]??null:value??null;
const jobSelect="id,business_id,job_number,title,status,priority,starts_at,arrival_window_start,arrival_window_end,service_address,customers!jobs_customer_tenant_fk(first_name,last_name,company_name),services!jobs_service_tenant_fk(name),service_locations!jobs_service_location_tenant_fk(street_address,city,state)";

export async function GET(request:Request,{params}:{params:Promise<{businessId:string}>}){
  const requestId=newMobileRequestId();
  try{
    const {businessId}=await params,query=mobileJobsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if(!query.success)throw new MobileApiError("VALIDATION_FAILED","Use a valid job range and limit.",400);
    const context=await createMobileAuthorizationContext(request),workspace=requireMobileWorkspace(context,businessId),technician=context.techniciansByBusinessId.get(businessId),business=await mobileBusiness(context,businessId),bounds=mobileJobRangeBounds(business.timezone,query.data.range);
    let rows:any[]|null=null,error:any=null;
    if(technician){
      const result=await context.supabase.from("jobs").select(`${jobSelect},job_assignments!inner(assignment_role)`).eq("business_id",businessId).eq("is_deleted",false).eq("job_assignments.technician_id",technician.id).eq("job_assignments.is_active",true).gte("starts_at",bounds.start).lt("starts_at",bounds.end).order("starts_at",{ascending:bounds.ascending}).order("id",{ascending:bounds.ascending}).limit(query.data.limit+1);
      rows=result.data;error=result.error;
    }else{
      requireOffice(workspace);
      const result=await context.supabase.from("jobs").select(jobSelect).eq("business_id",businessId).eq("is_deleted",false).gte("starts_at",bounds.start).lt("starts_at",bounds.end).order("starts_at",{ascending:bounds.ascending}).order("id",{ascending:bounds.ascending}).limit(query.data.limit+1);
      rows=result.data;error=result.error;
    }
    if(error)throw new MobileApiError("SERVICE_UNAVAILABLE","Jobs are temporarily unavailable.",503,true);
    const truncated=(rows??[]).length>query.data.limit,items=(rows??[]).slice(0,query.data.limit).map(row=>summary(row,relation<any>(row.job_assignments)?.assignment_role??"primary"));
    return mobileSuccess(mobileJobsListDataSchema.parse({workspace,timezone:business.timezone,range:query.data.range,items,truncated}),requestId);
  }catch(error){return handleMobileApiError(error,requestId);}
}
const unsupported=()=>mobileError(new MobileApiError("NOT_FOUND","This method is not supported.",405),newMobileRequestId(),{headers:{allow:"GET"}});export const POST=unsupported;export const PUT=unsupported;export const PATCH=unsupported;export const DELETE=unsupported;
