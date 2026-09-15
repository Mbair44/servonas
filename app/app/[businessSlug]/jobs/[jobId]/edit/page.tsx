import Link from "next/link";
import { notFound } from "next/navigation";
import JobForm from "@/components/JobForm";
import { canManageCustomers } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import { WorkspaceNav } from "../../../WorkspaceNav";
import { updateJob } from "../../actions";

function localInput(value: string | null, timeZone: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export default async function EditJob({ params }: { params: Promise<{ businessSlug: string; jobId: string }> }) {
  const { businessSlug, jobId } = await params;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  if (!canManageCustomers(role)) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><div className="workspace-notice error">You do not have permission to edit jobs.</div></section></main>;
  const [{ data: job }, { data: customers }, { data: locations }, { data: services }, { data: technicians },{data:priorJobs},{data:assignments},{data:rentalBooking},{data:rentalInventory}] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", jobId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle(),
    supabase.from("customers").select("id,first_name,last_name,company_name").eq("business_id", business.id).eq("is_deleted", false).order("last_name"),
    supabase.from("service_locations").select("id,customer_id,location_name,street_address,city,state,default_technician_id").eq("business_id", business.id).eq("is_deleted", false).order("location_name"),
    supabase.from("services").select("id,name,duration_minutes").eq("business_id", business.id).eq("is_deleted", false).order("name"),
    supabase.from("technician_directory").select("id,preferred_name").eq("business_id", business.id).eq("is_active", true).eq("is_technician", true).eq("can_be_assigned_jobs", true).order("preferred_name"),
    supabase.from("jobs").select("id,job_number,title,customer_id,starts_at").eq("business_id",business.id).eq("is_deleted",false).neq("id",jobId).order("starts_at",{ascending:false}).limit(500),
    supabase.from("job_assignments").select("technician_id,assignment_role,assigned_at").eq("business_id",business.id).eq("job_id",jobId).eq("is_active",true).order("assigned_at"),
    supabase.from("bookings").select("id,booking_items(id,inventory_item_id,quantity,inventory_items(name))").eq("business_id",business.id).eq("job_id",jobId).maybeSingle(),
    supabase.from("inventory_items").select("id,name").eq("business_id",business.id).eq("active",true).order("name"),
  ]);
  if (!job) notFound();
  const formJob = {
    ...job,
    starts_at_local: localInput(job.starts_at, business.timezone),
    ends_at_local: localInput(job.ends_at, business.timezone),
    arrival_window_start_local: localInput(job.arrival_window_start, business.timezone),
    arrival_window_end_local: localInput(job.arrival_window_end, business.timezone),
    technician_ids: assignments?.length ? assignments.sort((a,b)=>a.assignment_role==="primary"?-1:b.assignment_role==="primary"?1:0).map(item=>item.technician_id) : job.assigned_technician_id ? [job.assigned_technician_id] : [],
  };
  const rentalBookingItems=(rentalBooking?.booking_items??[]).map((item:any)=>({id:item.id,inventory_item_id:item.inventory_item_id,quantity:Number(item.quantity??1),name:(Array.isArray(item.inventory_items)?item.inventory_items[0]:item.inventory_items)?.name??"Rental item"}));
  const rentalInventoryChoices=[...(rentalInventory??[])];
  for(const item of rentalBookingItems)if(!rentalInventoryChoices.some(choice=>choice.id===item.inventory_item_id))rentalInventoryChoices.push({id:item.inventory_item_id,name:`${item.name} (current)`});
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content">
    <header className="epic3-header"><div><small>Job #{job.job_number}</small><h1>Edit {job.title}</h1><p>All scheduling times are shown in {business.timezone}.</p></div><Link href={`/app/${businessSlug}/jobs/${jobId}`}>Back to job</Link></header>
    <section className="workspace-panel"><JobForm action={updateJob.bind(null, businessSlug, jobId)} customers={customers ?? []} locations={locations ?? []} services={services ?? []} technicians={technicians ?? []} priorJobs={priorJobs??[]} rentalBookingItems={rentalBookingItems} rentalInventory={rentalInventoryChoices} job={formJob} submitLabel="Save job"/></section>
  </section></main>;
}
