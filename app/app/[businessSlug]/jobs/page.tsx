import Link from "next/link";
import {WorkspaceNav} from "../WorkspaceNav";
import {requireWorkspace} from "@/lib/workspace";
import {canManageCustomers} from "@/lib/access";
import {jobPriorities,jobStatuses} from "@/lib/jobValidation";

const pageSize=25;
const relation=<T,>(value:T|T[]|null)=>Array.isArray(value)?value[0]??null:value;
const initials=(value:string)=>value.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase()||"J";
const label=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());

export default async function Jobs({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,query=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug);
 let jobsQuery=supabase.from("jobs").select("id,job_number,title,status,priority,starts_at,total_amount,assigned_technician_id,customers!jobs_customer_tenant_fk(first_name,last_name,company_name),service_locations!jobs_service_location_tenant_fk(location_name,street_address,city,state),services!jobs_service_tenant_fk(name)")
  .eq("business_id",business.id).eq("is_deleted",false);
 if(query.status&&query.status!=="all")jobsQuery=jobsQuery.eq("status",query.status);
 if(query.priority&&query.priority!=="all")jobsQuery=jobsQuery.eq("priority",query.priority);
 if(query.customerId)jobsQuery=jobsQuery.eq("customer_id",query.customerId);
 if(query.technicianId)jobsQuery=jobsQuery.eq("assigned_technician_id",query.technicianId);
 if(query.assignment==="unassigned")jobsQuery=jobsQuery.is("assigned_technician_id",null);
 if(query.serviceId)jobsQuery=jobsQuery.eq("service_id",query.serviceId);
 if(query.date)jobsQuery=jobsQuery.gte("starts_at",`${query.date}T00:00:00`).lt("starts_at",`${query.date}T23:59:59.999`);
 if(query.q){
  const search=query.q.replaceAll(",","");
  jobsQuery=/^\d+$/.test(search)?jobsQuery.eq("job_number",Number(search)):jobsQuery.ilike("title",`%${search}%`);
 }
 jobsQuery=query.sort==="newest"?jobsQuery.order("created_at",{ascending:false})
  :query.sort==="status"?jobsQuery.order("status").order("starts_at",{ascending:true,nullsFirst:false})
  :jobsQuery.order("starts_at",{ascending:true,nullsFirst:false});

 const [{data:jobs,error},{data:summaryRows},{data:customers},{data:technicians},{data:services}]=await Promise.all([
  jobsQuery,
  supabase.from("jobs").select("id,status,assigned_technician_id").eq("business_id",business.id).eq("is_deleted",false),
  supabase.from("customers").select("id,first_name,last_name,company_name").eq("business_id",business.id).eq("is_deleted",false).order("last_name"),
  supabase.from("technician_directory").select("id,preferred_name").eq("business_id",business.id).eq("is_active",true).eq("is_technician",true).order("preferred_name"),
  supabase.from("services").select("id,name").eq("business_id",business.id).eq("is_deleted",false).order("name"),
 ]);
 if(error){
  console.error("Job list query failed",{code:error.code,businessId:business.id});
  throw new Error("Jobs could not be loaded.");
 }

 const rows=jobs??[],page=Math.max(1,Number(query.page)||1),totalPages=Math.max(1,Math.ceil(rows.length/pageSize)),currentPage=Math.min(page,totalPages);
 const visible=rows.slice((currentPage-1)*pageSize,currentPage*pageSize);
 const selected=rows.find(job=>job.id===query.job)??null;
 const selectedCustomer=selected?relation(selected.customers):null,selectedLocation=selected?relation(selected.service_locations):null,selectedService=selected?relation(selected.services):null;
 const selectedTechnician=selected?technicians?.find(item=>item.id===selected.assigned_technician_id):null;
 const all=summaryRows??[],terminal=new Set(["completed","canceled","cancelled","declined"]);
 const unassigned=all.filter(job=>!job.assigned_technician_id&&!terminal.has(job.status)).length;
 const inProgress=all.filter(job=>["en_route","arrived","in_progress"].includes(job.status)).length;
 const completed=all.filter(job=>job.status==="completed").length;
 const canEdit=canManageCustomers(role),base=`/app/${businessSlug}/jobs`;
 const href=(overrides:Record<string,string|undefined>)=>{
  const values={q:query.q,date:query.date,status:query.status,technicianId:query.technicianId,assignment:query.assignment,customerId:query.customerId,priority:query.priority,serviceId:query.serviceId,sort:query.sort,page:String(currentPage),...overrides};
  const search=new URLSearchParams(Object.entries(values).filter((entry):entry is [string,string]=>Boolean(entry[1])));
  return `${base}?${search}#job-directory`;
 };
 const formatDate=(date:string|null)=>date?new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short",timeZone:business.timezone}).format(new Date(date)):"Unscheduled";
 const money=(value:number|null)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(value??0));

 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content employee-directory-page jobs-directory-page">
  <header className="employee-page-header"><div><nav aria-label="Breadcrumb"><span>Operations</span><b aria-hidden="true">›</b><span>Jobs</span></nav><h1>Jobs</h1><p>Schedule, assign, and track work from intake through completion.</p></div>{canEdit&&<nav className="employee-primary-actions" aria-label="Job actions"><Link className="sv-button" href={`${base}/new${query.customerId?`?customerId=${query.customerId}`:""}`}><span aria-hidden="true">＋</span>Add job</Link></nav>}</header>
  {query.error&&<div className="workspace-notice error">{query.error}</div>}{query.success&&<div className="workspace-notice success">{query.success}</div>}

  <section className="employee-stat-row jobs-stat-row" aria-label="Job summary">
   <Link href={`${base}#job-directory`}><span>Total jobs</span><strong>{all.length.toLocaleString()}</strong><small className="new">● All work</small><i aria-hidden="true">▣</i></Link>
   <Link href={href({technicianId:undefined,assignment:"unassigned",status:"all",page:"1"})}><span>Unassigned</span><strong>{unassigned.toLocaleString()}</strong><small className={unassigned?"warning":"healthy"}>● {unassigned?"Needs attention":"All assigned"}</small><i aria-hidden="true">♙</i></Link>
   <Link href={href({status:"in_progress",page:"1"})}><span>In progress</span><strong>{inProgress.toLocaleString()}</strong><small className="violet">● Field work</small><i aria-hidden="true">↻</i></Link>
   <Link href={href({status:"completed",page:"1"})}><span>Completed</span><strong>{completed.toLocaleString()}</strong><small className="healthy">● Finished</small><i aria-hidden="true">✓</i></Link>
  </section>

  <section className={`employee-directory-shell jobs-directory-shell${selected?" has-selection":""}`} id="job-directory">
   <div className="employee-directory-main">
    <form className="employee-directory-toolbar jobs-directory-toolbar">
     <label className="employee-search"><span className="sr-only">Search jobs</span><input name="q" defaultValue={query.q??""} placeholder="Search by job title or number..."/><b aria-hidden="true">⌕</b></label>
     <label><span>Status</span><select name="status" defaultValue={query.status??"all"}><option value="all">All statuses</option>{jobStatuses.map(status=><option key={status} value={status}>{label(status)}</option>)}</select></label>
     <label><span>Technician</span><select name="technicianId" defaultValue={query.technicianId??""}><option value="">All technicians</option>{technicians?.map(item=><option key={item.id} value={item.id}>{item.preferred_name}</option>)}</select></label>
     <label><span>Date</span><input name="date" type="date" defaultValue={query.date??""}/></label>
     <details className="jobs-more-filters"><summary>More filters</summary><div>
      <label><span>Customer</span><select name="customerId" defaultValue={query.customerId??""}><option value="">All customers</option>{customers?.map(item=><option key={item.id} value={item.id}>{item.company_name||`${item.first_name} ${item.last_name}`}</option>)}</select></label>
      <label><span>Priority</span><select name="priority" defaultValue={query.priority??"all"}><option value="all">All priorities</option>{jobPriorities.map(priority=><option key={priority} value={priority}>{label(priority)}</option>)}</select></label>
      <label><span>Service</span><select name="serviceId" defaultValue={query.serviceId??""}><option value="">All services</option>{services?.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>Sort</span><select name="sort" defaultValue={query.sort??"scheduled"}><option value="scheduled">Scheduled first</option><option value="newest">Newest first</option><option value="status">Status</option></select></label>
     </div></details>
     <button className="sv-button sv-secondary" type="submit">Apply</button>
     <Link className="jobs-clear-filters" href={base}>Clear</Link>
    </form>

    <div className="jobs-table" role="table" aria-label="Jobs">
     <div className="jobs-table-head" role="row"><span role="columnheader">Job</span><span role="columnheader">Customer</span><span role="columnheader">Status</span><span role="columnheader">Technician</span><span role="columnheader">Scheduled</span><span role="columnheader">Total</span></div>
     {visible.length?visible.map(job=>{
      const customer=relation(job.customers),location=relation(job.service_locations),service=relation(job.services),technician=technicians?.find(item=>item.id===job.assigned_technician_id);
      const customerName=customer?.company_name||[customer?.first_name,customer?.last_name].filter(Boolean).join(" ")||"No customer";
      return <Link role="row" className={selected?.id===job.id?"selected":""} href={href({job:job.id})} key={job.id}>
       <span className="employee-table-identity" role="cell"><span className="employee-table-avatar">{initials(job.title)}</span><span><strong>#{job.job_number} · {job.title}</strong><small>{service?.name||"Custom work"}</small></span></span>
       <span className="jobs-customer" role="cell"><strong>{customerName}</strong><small>{location?`${location.city}, ${location.state}`:"No saved location"}</small></span>
       <span role="cell"><em className={`job-status ${job.status}`}>{label(job.status)}</em><small className={`job-priority ${job.priority}`}>{label(job.priority)}</small></span>
       <span role="cell">{technician?.preferred_name||<b className="jobs-unassigned">Unassigned</b>}</span>
       <time role="cell" dateTime={job.starts_at??undefined}>{formatDate(job.starts_at)}</time>
       <strong role="cell">{money(job.total_amount)}</strong>
      </Link>;
     }):<div className="dashboard-empty"><strong>No matching jobs.</strong><p>Adjust the filters or create a new job.</p></div>}
    </div>
    <footer className="customer-table-footer"><span>Showing {visible.length?`${(currentPage-1)*pageSize+1} to ${(currentPage-1)*pageSize+visible.length}`:"0"} of {rows.length} jobs</span>{totalPages>1&&<nav aria-label="Job pages">{currentPage>1&&<Link href={href({page:String(currentPage-1),job:undefined})}>←</Link>}<b>{currentPage}</b><span>of {totalPages}</span>{currentPage<totalPages&&<Link href={href({page:String(currentPage+1),job:undefined})}>→</Link>}</nav>}</footer>
   </div>

   {selected&&<aside className="employee-detail-panel jobs-detail-panel" aria-labelledby="selected-job-name">
    <header><span className="employee-detail-avatar">{initials(selected.title)}</span><div><h2 id="selected-job-name">#{selected.job_number} · {selected.title}</h2><p>{selectedService?.name||"Custom work"}</p></div><em className={`job-status ${selected.status}`}>{label(selected.status)}</em><Link href={href({job:undefined})} aria-label="Close job details">×</Link></header>
    <nav aria-label="Job detail sections"><span className="active">Overview</span><Link href={`${base}/${selected.id}`}>Full details</Link></nav>
    <dl>
     <div><dt>Customer</dt><dd>{selectedCustomer?.company_name||[selectedCustomer?.first_name,selectedCustomer?.last_name].filter(Boolean).join(" ")||"No customer"}</dd></div>
     <div><dt>Service</dt><dd>{selectedService?.name||"Custom work"}</dd></div>
     <div><dt>When</dt><dd>{formatDate(selected.starts_at)}</dd></div>
     <div><dt>Technician</dt><dd>{selectedTechnician?.preferred_name||"Unassigned"}</dd></div>
     <div><dt>Priority</dt><dd>{label(selected.priority)}</dd></div>
     <div><dt>Total</dt><dd>{money(selected.total_amount)}</dd></div>
    </dl>
    <section><h3>Service location</h3>{selectedLocation?<p><strong>{selectedLocation.location_name}</strong><br/>{selectedLocation.street_address}<br/>{selectedLocation.city}, {selectedLocation.state}</p>:<p>No saved service location.</p>}</section>
    <section className="jobs-detail-actions"><h3>Quick actions</h3><Link className="sv-button" href={`${base}/${selected.id}`}>Open job</Link>{canEdit&&<Link className="employee-quick-action" href={`${base}/${selected.id}/edit`}>Edit job</Link>}</section>
   </aside>}
  </section>
 </section></main>;
}
