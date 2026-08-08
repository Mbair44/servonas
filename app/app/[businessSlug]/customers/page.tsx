import Link from "next/link";
import {WorkspaceNav} from "../WorkspaceNav";
import {requireWorkspace} from "@/lib/workspace";
import {canManageCustomers} from "@/lib/access";
import {dateInTimeZone,formatBusinessDate,formatBusinessLocalInput} from "@/lib/bookingTime";
import {CustomerActionIcon} from "@/components/CustomerActionIcon";
import {EditCustomerDrawer} from "@/components/EditCustomerDrawer";
import {ScheduleServiceDrawer} from "@/components/ScheduleServiceDrawer";
import {ServicePlanDrawer} from "@/components/ServicePlanDrawer";
import {archiveCustomer,createServicePlan,updateCustomer} from "./actions";
import {createJob} from "../jobs/actions";
import {CustomerCampaignSelector,type CampaignCustomerHeader} from "@/components/CustomerCampaignSelector";

const pageSize=25;
const clean=(value:string)=>value.toLowerCase().trim();
const initials=(name:string)=>name.split(/\s+/).map(part=>part[0]).join("").slice(0,2).toUpperCase();

export default async function Customers({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug),canEdit=canManageCustomers(role);
 const search=clean(q.q??""),status=["active","inactive","no_history","all"].includes(q.status??"")?q.status!:"all",type=["individual","company","all"].includes(q.type??"")?q.type!:"all";
 const page=Math.max(1,Number(q.page)||1);
 const sortKeys=["customer","contact","type","status","locations","last_service","next_service","jobs"] as const;
 type CustomerSort=typeof sortKeys[number];
 const sort=(sortKeys as readonly string[]).includes(q.sort??"")?q.sort as CustomerSort:"customer";
 const direction=q.direction==="desc"?"desc":"asc";
 const {data:customers,error}=await supabase.from("customers").select("id,first_name,last_name,company_name,email,phone,secondary_phone,preferred_contact_method,notes,tags,lead_source,is_active,created_at").eq("business_id",business.id).eq("is_deleted",false).limit(1000);
 if(error) console.error("Customer directory could not be loaded",{businessId:business.id,code:error.code});
 const ids=(customers??[]).map(customer=>customer.id);
 const [locationsResult,jobsResult]=ids.length?await Promise.all([
  supabase.from("service_locations").select("id,customer_id,location_name,street_address,unit,city,state,postal_code,is_primary,default_technician_id").eq("business_id",business.id).eq("is_deleted",false).in("customer_id",ids),
  supabase.from("jobs").select("id,customer_id,starts_at,status,work_completed_at").eq("business_id",business.id).eq("is_deleted",false).in("customer_id",ids).order("starts_at",{ascending:false,nullsFirst:false}),
 ]):[{data:[]},{data:[]}];
 const locations=locationsResult.data??[],jobs=jobsResult.data??[],now=Date.now();
 const directory=(customers??[]).map(customer=>{
  const customerLocations=locations.filter(location=>location.customer_id===customer.id),customerJobs=jobs.filter(job=>job.customer_id===customer.id);
  const primary=customerLocations.find(location=>location.is_primary)??customerLocations[0]??null;
  const completedServices=customerJobs.filter(job=>job.status==="completed"&&(job.work_completed_at||job.starts_at)&&new Date(job.work_completed_at??job.starts_at!).getTime()<=now)
   .map(job=>job.work_completed_at??job.starts_at!).sort((a,b)=>new Date(b).getTime()-new Date(a).getTime());
  const upcomingServices=customerJobs.filter(job=>job.starts_at&&new Date(job.starts_at).getTime()>now&&!["completed","canceled","cancelled","declined"].includes(job.status))
   .map(job=>job.starts_at!).sort((a,b)=>new Date(a).getTime()-new Date(b).getTime());
  return {...customer,displayName:customer.company_name||`${customer.first_name} ${customer.last_name}`.trim(),customerType:customer.company_name?"company":"individual",locations:customerLocations,primary,jobCount:customerJobs.length,lastService:completedServices[0]??null,nextService:upcomingServices[0]??null};
 });
 const rows=directory.filter(customer=>(status==="all"||(status==="active"&&customer.is_active)||(status==="inactive"&&!customer.is_active)||(status==="no_history"&&!customer.jobCount))
  &&(type==="all"||customer.customerType===type)
  &&(!search||[customer.displayName,customer.first_name,customer.last_name,customer.email,customer.phone,customer.primary?.street_address,customer.primary?.city,customer.primary?.state].some(value=>String(value??"").toLowerCase().includes(search))))
  .sort((a,b)=>{
   const value=(customer:typeof a):string|number=>{
    if(sort==="contact")return customer.email||customer.phone||"";
    if(sort==="type")return customer.customerType;
    if(sort==="status")return customer.is_active?1:0;
    if(sort==="locations")return customer.locations.length;
    if(sort==="last_service")return customer.lastService?new Date(customer.lastService).getTime():-1;
    if(sort==="next_service")return customer.nextService?new Date(customer.nextService).getTime():-1;
    if(sort==="jobs")return customer.jobCount;
    return customer.displayName;
   };
   const left=value(a),right=value(b);
   const result=typeof left==="string"&&typeof right==="string"?left.localeCompare(right,undefined,{numeric:true,sensitivity:"base"}):Number(left)-Number(right);
   return (direction==="asc"?result:-result)||a.displayName.localeCompare(b.displayName);
  });
 const totalPages=Math.max(1,Math.ceil(rows.length/pageSize)),currentPage=Math.min(page,totalPages),visible=rows.slice((currentPage-1)*pageSize,currentPage*pageSize);
 const selected=directory.find(customer=>customer.id===q.customer)??null;
 const [servicesResult,employeesResult]=selected?await Promise.all([
  supabase.from("services").select("id,name,duration_minutes,price_amount").eq("business_id",business.id).eq("is_deleted",false).eq("active",true).order("name"),
  supabase.from("technician_directory").select("id,preferred_name").eq("business_id",business.id).eq("is_active",true).eq("is_technician",true).eq("can_be_assigned_jobs",true).order("preferred_name"),
 ]):[{data:[]},{data:[]}];
 const services=servicesResult.data??[],employees=employeesResult.data??[];
 const monthStart=new Date();monthStart.setUTCDate(1);monthStart.setUTCHours(0,0,0,0);
 const newThisMonth=directory.filter(customer=>new Date(customer.created_at)>=monthStart).length,noHistory=directory.filter(customer=>!customer.jobCount).length;
 const base=`/app/${businessSlug}/customers`;
 const href=(overrides:Record<string,string|undefined>)=>{const values={q:q.q,status,type,sort,direction,page:String(currentPage),...overrides};const query=new URLSearchParams(Object.entries(values).filter((entry):entry is [string,string]=>Boolean(entry[1])));return `${base}?${query}#customer-directory`;};
 const sortHref=(column:CustomerSort)=>href({sort:column,direction:sort===column&&direction==="asc"?"desc":"asc",page:"1",customer:undefined});
 const headers:CampaignCustomerHeader[]=[["customer","Customer"],["contact","Primary contact"],["type","Type"],["status","Status"],["locations","Locations"],["last_service","Last service"],["next_service","Next service"],["jobs","Total jobs"]].map(([column,label])=>({label,href:sortHref(column as CustomerSort),active:sort===column,direction}));

 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content employee-directory-page customer-directory-page">
  <header className="employee-page-header"><div><nav aria-label="Breadcrumb"><span>CRM</span><b aria-hidden="true">›</b><span>Customers</span></nav><h1>Customers</h1><p>Contacts, service locations, and job history in one place.</p></div><nav className="employee-primary-actions" aria-label="Customer actions"><Link className="sv-button sv-secondary" href={`${base}/campaigns`}>Campaigns</Link><Link className="sv-button sv-secondary" href={`${base}/messages`}>Text inbox</Link>{canEdit&&<><Link className="sv-button sv-secondary" href={`${base}/imports`}><span aria-hidden="true">↥</span>Import customers</Link><Link className="sv-button" href={`${base}/new`}><span aria-hidden="true">＋</span>Add customer</Link></>}</nav></header>
  {q.error&&<div className="workspace-notice error">{q.error}</div>}{q.success&&<div className="workspace-notice success">{q.success}</div>}

  <section className="employee-stat-row" aria-label="Customer summary">
   <Link href={`${base}#customer-directory`}><span>Total customers</span><strong>{directory.length.toLocaleString()}</strong><small className="healthy">{newThisMonth?`▲ ${newThisMonth} this month`:`● ${directory.filter(customer=>customer.is_active).length} active`}</small><i aria-hidden="true">♙</i></Link>
   <Link href={href({status:"active",page:"1"})}><span>Active customers</span><strong>{directory.filter(customer=>customer.is_active).length.toLocaleString()}</strong><small className="healthy">● Active</small><i aria-hidden="true">♙</i></Link>
   <Link href={href({status:"all",page:"1"})}><span>New this month</span><strong>{newThisMonth.toLocaleString()}</strong><small className="new">● New</small><i aria-hidden="true">☆</i></Link>
   {noHistory>0&&<Link href={href({status:"no_history",page:"1"})}><span>No service history</span><strong>{noHistory.toLocaleString()}</strong><small className="warning">● Needs attention</small><i aria-hidden="true">△</i></Link>}
   {noHistory>0&&<Link className="view-issues" href={href({status:"no_history",page:"1"})}>View issues <span aria-hidden="true">→</span></Link>}
  </section>

  <section className={`employee-directory-shell customer-directory-shell${selected?" has-selection":""}`} id="customer-directory">
   <div className="employee-directory-main">
    <form className="employee-directory-toolbar customer-directory-toolbar">
     <input type="hidden" name="sort" value={sort}/><input type="hidden" name="direction" value={direction}/>
     <label className="employee-search"><span className="sr-only">Search customers</span><input name="q" defaultValue={q.q??""} placeholder="Search by name, company, email, phone, or address..."/><b aria-hidden="true">⌕</b></label>
     <label><span>Status</span><select name="status" defaultValue={status}><option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="no_history">No service history</option></select></label>
     <label><span>Customer type</span><select name="type" defaultValue={type}><option value="all">All types</option><option value="individual">Individual</option><option value="company">Company</option></select></label>
     <button className="sv-button sv-secondary" type="submit">Filters</button>
    </form>
    <CustomerCampaignSelector businessSlug={businessSlug} canCreate={canEdit} headers={headers} rows={visible.map(customer=>({id:customer.id,href:href({customer:customer.id}),selected:selected?.id===customer.id,initials:initials(customer.displayName),name:customer.displayName,subtitle:customer.company_name?`${customer.first_name} ${customer.last_name}`.trim():"Customer",email:customer.email||"No email",phone:customer.phone||"No phone",type:customer.customerType,active:customer.is_active,locations:customer.locations.length,lastService:customer.lastService?formatBusinessDate(customer.lastService,business.timezone):"—",nextService:customer.nextService?formatBusinessDate(customer.nextService,business.timezone):"—",jobs:customer.jobCount}))}/>
    <footer className="customer-table-footer"><span>Showing {visible.length?`${(currentPage-1)*pageSize+1} to ${(currentPage-1)*pageSize+visible.length}`:"0"} of {rows.length} customers</span>{totalPages>1&&<nav aria-label="Customer pages">{currentPage>1&&<Link href={href({page:String(currentPage-1)})}>←</Link>}<b>{currentPage}</b><span>of {totalPages}</span>{currentPage<totalPages&&<Link href={href({page:String(currentPage+1)})}>→</Link>}</nav>}</footer>
   </div>

   {selected&&<div className="customer-detail-drawer-layer">
    <Link className="customer-detail-drawer-backdrop" href={`${base}#customer-directory`} aria-label="Close customer details"/>
    <aside className="employee-detail-panel customer-detail-panel" aria-labelledby="selected-customer-name">
    <header><span className="employee-detail-avatar">{initials(selected.displayName)}</span><div><h2 id="selected-customer-name">{selected.displayName}</h2><p>{selected.company_name?`${selected.first_name} ${selected.last_name}`.trim():"Individual customer"}</p></div><b className={`employee-state ${selected.is_active?"active":"inactive"}`}>{selected.is_active?"Active":"Inactive"}</b>{canEdit&&<EditCustomerDrawer trigger="header" customer={selected} action={updateCustomer.bind(null,businessSlug,selected.id)}/>}<Link href={`${base}#customer-directory`} aria-label="Close customer details">×</Link></header>
    <section className="customer-drawer-summary" aria-label="Customer record summary">
     <div><span>Locations</span><strong>{selected.locations.length}</strong></div>
     <div><span>Total jobs</span><strong>{selected.jobCount}</strong></div>
     <div><span>Last service</span><strong>{selected.lastService?formatBusinessDate(selected.lastService,business.timezone):"—"}</strong></div>
     <Link href={`${base}/${selected.id}`}>View full customer record <span aria-hidden="true">→</span></Link>
    </section>
    <dl><div><dt>Email</dt><dd>{selected.email||"Not provided"}</dd></div><div><dt>Phone</dt><dd>{selected.phone||"Not provided"}</dd></div><div><dt>Address</dt><dd>{selected.primary?<>{selected.primary.street_address}{selected.primary.unit?`, ${selected.primary.unit}`:""}<br/>{selected.primary.city}, {selected.primary.state} {selected.primary.postal_code}</>:"No service location"}</dd></div></dl>
    <section className="customer-facts"><h3>Customer details</h3><dl><div><dt>Type</dt><dd><em className={`customer-type ${selected.customerType}`}>{selected.customerType}</em></dd></div><div><dt>Since</dt><dd>{formatBusinessDate(selected.created_at,business.timezone)}</dd></div><div><dt>Last service</dt><dd>{selected.lastService?formatBusinessDate(selected.lastService,business.timezone):"—"}</dd></div><div><dt>Next service</dt><dd>{selected.nextService?formatBusinessDate(selected.nextService,business.timezone):"—"}</dd></div><div><dt>Total jobs</dt><dd>{selected.jobCount}</dd></div></dl></section>
    {canEdit&&<section className="customer-panel-actions"><h3>Quick actions</h3><div><h4>Schedule &amp; work</h4><ScheduleServiceDrawer menuItem customer={{id:selected.id,first_name:selected.first_name,last_name:selected.last_name,company_name:selected.company_name}} locations={selected.locations.map(location=>({id:location.id,customer_id:location.customer_id,location_name:location.location_name,street_address:location.street_address,city:location.city,state:location.state,default_technician_id:location.default_technician_id}))} services={services} technicians={employees} action={createJob.bind(null,businessSlug)} defaultStartAt={formatBusinessLocalInput(new Date().toISOString(),business.timezone)}/><ScheduleServiceDrawer menuItem mode="job" customer={{id:selected.id,first_name:selected.first_name,last_name:selected.last_name,company_name:selected.company_name}} locations={selected.locations.map(location=>({id:location.id,customer_id:location.customer_id,location_name:location.location_name,street_address:location.street_address,city:location.city,state:location.state,default_technician_id:location.default_technician_id}))} services={services} technicians={employees} action={createJob.bind(null,businessSlug)} defaultStartAt={formatBusinessLocalInput(new Date().toISOString(),business.timezone)}/><ServicePlanDrawer menuItem customerName={selected.displayName} locations={selected.locations.map(location=>({id:location.id,name:location.location_name||location.street_address}))} services={services.map(service=>({id:service.id,name:service.name,price_amount:service.price_amount}))} employees={employees.map(employee=>({id:employee.id,name:employee.preferred_name}))} defaultStartDate={dateInTimeZone(new Date(),business.timezone)} action={createServicePlan.bind(null,businessSlug,selected.id)}/></div><div><h4>Other</h4><form action={archiveCustomer.bind(null,businessSlug,selected.id)}><button className="customer-action-item destructive"><i className="customer-action-icon archive"><CustomerActionIcon name="archive"/></i><span><strong>Archive customer</strong><small>Deactivate this customer</small></span><b aria-hidden="true">›</b></button></form></div></section>}
    </aside>
   </div>}
  </section>
 </section></main>;
}
