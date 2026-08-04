import {canManageCustomers} from "@/lib/access";
import {formatBusinessLocalInput} from "@/lib/bookingTime";
import {requireWorkspace} from "@/lib/workspace";
import {createJob} from "@/app/app/[businessSlug]/jobs/actions";
import {JobCreateDrawer} from "./JobCreateDrawer";

export async function AddJobDrawer({businessSlug,defaultCustomerId="",label="Add job",className="sv-button",autoOpen=false,icon=true}:{businessSlug:string;defaultCustomerId?:string;label?:string;className?:string;autoOpen?:boolean;icon?:boolean}){
 const {supabase,business,role}=await requireWorkspace(businessSlug);
 if(!canManageCustomers(role))return null;
 const [{data:customers},{data:locations},{data:services},{data:technicians},{data:priorJobs}]=await Promise.all([
  supabase.from("customers").select("id,first_name,last_name,company_name").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).order("last_name"),
  supabase.from("service_locations").select("id,customer_id,location_name,street_address,city,state,default_technician_id").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).order("location_name"),
  supabase.from("services").select("id,name,duration_minutes").eq("business_id",business.id).eq("is_deleted",false).eq("active",true).order("name"),
  supabase.from("technician_directory").select("id,preferred_name").eq("business_id",business.id).eq("is_active",true).eq("is_technician",true).eq("can_be_assigned_jobs",true).order("preferred_name"),
  supabase.from("jobs").select("id,job_number,title,customer_id,starts_at").eq("business_id",business.id).eq("is_deleted",false).order("starts_at",{ascending:false}).limit(500),
 ]);
 return <JobCreateDrawer customers={customers??[]} locations={locations??[]} services={services??[]} technicians={technicians??[]} priorJobs={priorJobs??[]} action={createJob.bind(null,businessSlug)} defaultCustomerId={defaultCustomerId} defaultStartAt={formatBusinessLocalInput(new Date().toISOString(),business.timezone)} label={label} className={className} autoOpen={autoOpen} icon={icon}/>;
}
