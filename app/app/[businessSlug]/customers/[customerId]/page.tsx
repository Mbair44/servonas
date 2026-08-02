import Link from "next/link";
import {notFound} from "next/navigation";
import {canManageCustomers} from "@/lib/access";
import {dateInTimeZone,formatBusinessDate,formatBusinessDateTime,formatBusinessLocalInput} from "@/lib/bookingTime";
import {requireWorkspace} from "@/lib/workspace";
import {WorkspaceNav} from "../../WorkspaceNav";
import {ServicePlanDrawer} from "@/components/ServicePlanDrawer";
import {ScheduleServiceDrawer} from "@/components/ScheduleServiceDrawer";
import {EditCustomerDrawer} from "@/components/EditCustomerDrawer";
import {CustomerActionIcon} from "@/components/CustomerActionIcon";
import {ServicePlanRowMenu} from "@/components/ServicePlanRowMenu";
import {ServiceLocationDrawer} from "@/components/ServiceLocationDrawer";
import {CustomerHvacEquipment} from "@/components/CustomerHvacEquipment";
import {MissedCallTranscript} from "@/components/MissedCallTranscript";
import {PoolServiceHistory} from "@/components/PoolServiceHistory";
import {hasIndustryCapability} from "@/lib/industryCapabilities";
import {archiveCustomer,assignCustomerOperations,createServicePlan,deleteServicePlan,retryServicePlanJobGeneration,saveServiceLocation,skipNextServicePlanOccurrence,updateCustomer,updateServicePlan} from "../actions";
import {archiveCustomerHvacEquipment,createCustomerHvacEquipment,updateCustomerHvacEquipment} from "../hvacEquipmentActions";
import {createJob} from "../../jobs/actions";

export default async function CustomerDetail({params,searchParams}:{params:Promise<{businessSlug:string;customerId:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug,customerId}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug);
 const isHvac=hasIndustryCapability(business.industry_profile,"equipmentTracking")&&business.industry_profile==="hvac";
 const isPool=hasIndustryCapability(business.industry_profile,"poolServiceLogs");
 const [{data:customer},{data:locations},{data:jobs},{data:plans},{data:services},{data:employees},{data:invoices,error:invoiceMetricsError},{data:payments,error:paymentMetricsError},{data:territories},{data:billingProfile},{data:billingSettings},{data:hvacEquipment,error:hvacEquipmentError},{data:recoveryMessages}]=await Promise.all([
  supabase.from("customers").select("*").eq("id",customerId).eq("business_id",business.id).eq("is_deleted",false).maybeSingle(),
  supabase.from("service_locations").select("*").eq("customer_id",customerId).eq("business_id",business.id).eq("is_deleted",false).order("is_primary",{ascending:false}),
  supabase.from("jobs").select("id,job_number,title,status,starts_at,ends_at,work_completed_at,total_amount,assigned_technician_id,recurring_service_series_id,service_plan_occurrence_id,occurrence_date,generation_type,cancellation_reason").eq("customer_id",customerId).eq("business_id",business.id).eq("is_deleted",false).order("starts_at",{ascending:false,nullsFirst:false}),
  supabase.from("recurring_service_series").select("id,name,status,service_location_id,service_id,default_employee_id,start_date,end_date,first_recurring_date,cadence_unit,cadence_interval,default_duration_minutes,recurring_price,preferred_time_window,taxable,next_due_on,scheduling_mode,scheduling_flex_days,auto_dispatch").eq("customer_id",customerId).eq("business_id",business.id).order("created_at",{ascending:false}),
  supabase.from("services").select("id,name,price_amount,duration_minutes").eq("business_id",business.id).eq("is_deleted",false).eq("active",true).order("name"),
  supabase.from("technician_directory").select("id,preferred_name").eq("business_id",business.id).eq("is_active",true).eq("is_technician",true).eq("can_be_assigned_jobs",true).order("preferred_name"),
  supabase.from("invoices").select("balance_due_cents,amount_paid_cents,amount_refunded_cents").eq("business_id",business.id).eq("customer_id",customerId).eq("is_deleted",false),
  supabase.from("payments").select("amount_cents,refunded_amount_cents,status").eq("business_id",business.id).eq("customer_id",customerId).in("status",["succeeded","partially_refunded","refunded"]),
  supabase.from("workforce_territories").select("id,name").eq("business_id",business.id).eq("is_active",true).order("name"),
  supabase.from("customer_billing_profiles").select("use_business_defaults,billing_method,payment_terms_days,auto_send_invoice,autopay_enabled,billing_email,billing_notes").eq("business_id",business.id).eq("customer_id",customerId).maybeSingle(),
  supabase.from("business_billing_settings").select("default_billing_method,default_payment_terms_days,review_before_processing").eq("business_id",business.id).maybeSingle(),
  isHvac?supabase.from("customer_hvac_equipment").select("id,equipment_type,name,manufacturer,model,serial_number,model_year,capacity_tons,fuel_type,refrigerant_type,filter_size,installed_on,warranty_expires_on,notes,service_location_id").eq("business_id",business.id).eq("customer_id",customerId).eq("is_active",true).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null}),
  supabase.from("missed_call_recovery_messages").select("id,direction,body,ai_generated,delivery_status,created_at").eq("business_id",business.id).eq("customer_id",customerId).order("created_at"),
 ]);
 if(!customer)notFound();
 const {data:poolLogs}=isPool?await supabase.from("pool_service_logs").select("*,technician_profiles!pool_service_logs_business_id_technician_id_fkey(preferred_name)").eq("business_id",business.id).eq("customer_id",customerId).eq("status","completed").order("completed_at",{ascending:false}).limit(50):{data:[]};
 const poolLogIds=(poolLogs??[]).map(item=>item.id),poolJobIds=(poolLogs??[]).map(item=>item.job_id);
 const [{data:poolLogChemicals},{data:poolLogTasks},{data:poolRanges},{data:poolPhotoRows}]=isPool?await Promise.all([
  poolLogIds.length?supabase.from("pool_service_log_chemicals").select("pool_service_log_id,chemical_name,amount,unit,estimated_cost_cents").eq("business_id",business.id).in("pool_service_log_id",poolLogIds):Promise.resolve({data:[]}),
  poolLogIds.length?supabase.from("pool_service_log_checklist").select("pool_service_log_id,task_label,completed").eq("business_id",business.id).in("pool_service_log_id",poolLogIds):Promise.resolve({data:[]}),
  supabase.from("pool_chemistry_ranges").select("field_key,minimum_value,maximum_value,consecutive_visits").eq("business_id",business.id),
  poolJobIds.length?supabase.from("job_photos").select("job_id,storage_path,photo_type,caption").eq("business_id",business.id).in("job_id",poolJobIds):Promise.resolve({data:[]}),
 ]):[{data:[]},{data:[]},{data:[]},{data:[]}];
 const poolPhotos=await Promise.all((poolPhotoRows??[]).map(async photo=>{const {data}=await supabase.storage.from("job-photos").createSignedUrl(photo.storage_path,3600);return {...photo,url:data?.signedUrl??null}}));
 const canEdit=canManageCustomers(role),now=Date.now();
 const upcoming=(jobs??[]).filter(job=>job.starts_at&&new Date(job.starts_at).getTime()>=now&&!["completed","canceled","declined"].includes(job.status)).sort((a,b)=>new Date(a.starts_at!).getTime()-new Date(b.starts_at!).getTime());
 const history=(jobs??[]).filter(job=>job.status==="completed"&&(job.work_completed_at||job.starts_at)&&new Date(job.work_completed_at??job.starts_at!).getTime()<=now).sort((a,b)=>new Date(b.work_completed_at??b.starts_at!).getTime()-new Date(a.work_completed_at??a.starts_at!).getTime());
 const activePlans=(plans??[]).filter(plan=>plan.status==="active"),lastService=history[0],nextService=upcoming[0];
 const recentJobs=(jobs??[]).slice(0,10);
 // A plan due date is not proof that a visit was generated and scheduled.
 // Only display an actual upcoming job as the customer's next service.
 const nextServiceDate=nextService?.starts_at??null;
 if(invoiceMetricsError||paymentMetricsError){
  console.error("Customer financial metrics could not be fully loaded",{
   customerId,
   invoiceError:invoiceMetricsError?.message,
   paymentError:paymentMetricsError?.message
  });
 }
 if(hvacEquipmentError)console.error("Customer HVAC equipment could not be loaded",{businessId:business.id,customerId,code:hvacEquipmentError.code});
 const outstanding=(invoices??[]).reduce((sum,item)=>sum+Number(item.balance_due_cents??0),0);
 const ledgerSpent=(payments??[]).reduce((sum,item)=>sum+Math.max(0,Number(item.amount_cents??0)-Number(item.refunded_amount_cents??0)),0);
 const invoiceSpent=(invoices??[]).reduce((sum,item)=>sum+Math.max(0,Number(item.amount_paid_cents??0)-Number(item.amount_refunded_cents??0)),0);
 const spent=!paymentMetricsError&&(payments?.length??0)>0?ledgerSpent:invoiceSpent;
 const name=customer.company_name||`${customer.first_name} ${customer.last_name}`.trim(),primary=locations?.find(location=>location.is_primary)??locations?.[0];
 const primaryAddress=primary?[primary.street_address,primary.unit,primary.city,primary.state,primary.postal_code].filter(Boolean).join(", "):"";
 const assignedTerritory=territories?.find(territory=>territory.id===primary?.territory_id),assignedTechnician=employees?.find(employee=>employee.id===primary?.default_technician_id);
 const assignmentNeedsAttention=!primary||!assignedTerritory||!assignedTechnician;
 const usesBillingDefaults=billingProfile?.use_business_defaults??true;
 const billingMethod=usesBillingDefaults?billingSettings?.default_billing_method:billingProfile?.billing_method??billingSettings?.default_billing_method;
 const billingMethodLabels:Record<string,string>={auto_charge_after_completion:"Auto-charge",invoice_after_completion:"Invoice after service",manual_billing:"Manual billing"};
 const billingMethodLabel=billingMethodLabels[String(billingMethod??"")]??"Invoice after service";
 const paymentTerms=usesBillingDefaults?billingSettings?.default_payment_terms_days:billingProfile?.payment_terms_days??billingSettings?.default_payment_terms_days;
 const autoSend=usesBillingDefaults?!billingSettings?.review_before_processing:billingProfile?.auto_send_invoice??!billingSettings?.review_before_processing;
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content customer-record-page">
  <header className="customer-record-header"><div><small><Link href={`/app/${businessSlug}/customers`}>Customers</Link> › {name}</small><h1>{name} <span className={`customer-record-status ${customer.is_active?"active":"inactive"}`}>{customer.is_active?"Active":"Inactive"}</span></h1><p>{customer.company_name?"Company":"Residential customer"} · Customer since {formatBusinessDate(customer.created_at,business.timezone)}</p></div><div className="crm-header-actions">{customer.phone&&<a className="sv-button sv-secondary" href={`tel:${customer.phone}`}>Call</a>}{customer.email&&<a className="sv-button sv-secondary" href={`mailto:${customer.email}`}>Email</a>}{customer.phone&&<a className="sv-button sv-secondary" href={`sms:${customer.phone}`}>Text</a>}{canEdit&&<details className="customer-actions-menu"><summary className="sv-button">Actions <span aria-hidden="true">⌄</span></summary><div><section><h3>Schedule &amp; work</h3><ScheduleServiceDrawer menuItem customer={{id:customer.id,first_name:customer.first_name,last_name:customer.last_name,company_name:customer.company_name}} locations={(locations??[]).map(location=>({id:location.id,customer_id:location.customer_id,location_name:location.location_name,street_address:location.street_address,city:location.city,state:location.state,default_technician_id:location.default_technician_id}))} services={services??[]} technicians={employees??[]} action={createJob.bind(null,businessSlug)} defaultStartAt={formatBusinessLocalInput(new Date().toISOString(),business.timezone)}/><ScheduleServiceDrawer menuItem mode="job" customer={{id:customer.id,first_name:customer.first_name,last_name:customer.last_name,company_name:customer.company_name}} locations={(locations??[]).map(location=>({id:location.id,customer_id:location.customer_id,location_name:location.location_name,street_address:location.street_address,city:location.city,state:location.state,default_technician_id:location.default_technician_id}))} services={services??[]} technicians={employees??[]} action={createJob.bind(null,businessSlug)} defaultStartAt={formatBusinessLocalInput(new Date().toISOString(),business.timezone)}/><ServicePlanDrawer menuItem customerName={name} locations={(locations??[]).map(location=>({id:location.id,name:location.location_name||location.street_address}))} services={(services??[]).map(service=>({id:service.id,name:service.name,price_amount:service.price_amount}))} employees={(employees??[]).map(employee=>({id:employee.id,name:employee.preferred_name}))} defaultStartDate={dateInTimeZone(new Date(),business.timezone)} action={createServicePlan.bind(null,businessSlug,customerId)}/></section><section><h3>Customer details</h3><EditCustomerDrawer customer={customer} action={updateCustomer.bind(null,businessSlug,customerId)}/></section><section><h3>Other</h3><form action={archiveCustomer.bind(null,businessSlug,customerId)}><button className="customer-action-item destructive"><i className="customer-action-icon archive"><CustomerActionIcon name="archive"/></i><span><strong>Archive customer</strong><small>Deactivate this customer</small></span><b aria-hidden="true">›</b></button></form></section></div></details>}</div></header>
  {q.error&&<div className="workspace-notice error">{q.error}</div>}{q.success&&<div className="workspace-notice success">{q.success}</div>}{q.reconcilePlan&&<div className="workspace-notice warning"><div><strong>{q.warning??"Upcoming service-plan jobs still need attention."}</strong><p>The service plan is saved. Retry generation to safely create any missing jobs without duplicating existing ones.</p></div><form action={retryServicePlanJobGeneration.bind(null,businessSlug,customerId,q.reconcilePlan)}><button className="sv-button sv-secondary">Retry upcoming jobs</button></form></div>}
  {assignmentNeedsAttention&&<section className="customer-assignment-alert" aria-labelledby="customer-assignment-title"><div><span className="sv-kicker">Needs assignment</span><h2 id="customer-assignment-title">Complete this customer’s operating assignment</h2><p>{!primary?"Add a service address before Servonas can determine a territory and technician.":!assignedTerritory?"This address does not match an active territory. Select one manually or adjust the territory boundary.":"This territory does not have an assignable primary technician. Select a technician manually or update territory coverage."}</p></div>{primary&&canEdit&&<form action={assignCustomerOperations.bind(null,businessSlug,customerId)}><input type="hidden" name="serviceLocationId" value={primary.id}/><label>Territory<select name="territoryId" defaultValue={primary.territory_id??""}><option value="">Unassigned</option>{territories?.map(territory=><option key={territory.id} value={territory.id}>{territory.name}</option>)}</select></label><label>Technician<select name="technicianId" defaultValue={primary.default_technician_id??""}><option value="">Unassigned</option>{employees?.map(employee=><option key={employee.id} value={employee.id}>{employee.preferred_name}</option>)}</select></label><div><button className="sv-button" name="assignmentMode" value="manual">Save assignment</button><button className="sv-button sv-secondary" name="assignmentMode" value="automatic">Retry automatic match</button></div></form>}</section>}
  <section className="customer-record-metrics redesigned"><article className="locations"><div><i><CustomerActionIcon name="location"/></i><span><small>Locations</small><strong>{locations?.length??0}</strong></span></div><p>Service locations</p></article><article className="plans"><div><i><CustomerActionIcon name="calendar"/></i><span><small>Active plans</small><strong>{activePlans.length}</strong></span></div><p>Recurring service plans</p></article><article className="last-service"><div><i><CustomerActionIcon name="clock"/></i><span><small>Last service</small><strong>{lastService?formatBusinessDate(lastService.work_completed_at??lastService.starts_at!,business.timezone):"—"}</strong></span></div><p>Most recent completed</p></article><article className="next-service"><div><i><CustomerActionIcon name="calendar"/></i><span><small>Next service</small><strong className="accent">{nextServiceDate?formatBusinessDate(nextServiceDate,business.timezone):"—"}</strong></span></div><p>Upcoming scheduled</p></article><article className="balance"><div><i><CustomerActionIcon name="card"/></i><span><small>Outstanding balance</small><strong>${(outstanding/100).toFixed(2)}</strong></span></div><p>Balance due</p></article><article className="spent"><div><i><CustomerActionIcon name="chart"/></i><span><small>Total spent</small><strong>${(spent/100).toFixed(2)}</strong></span></div><p>Total customer spend</p></article></section>
  <nav className="customer-record-tabs"><span>Overview</span><a href="#service-plans">Service Plans <b>{activePlans.length}</b></a><a href="#locations">Locations <b>{locations?.length??0}</b></a>{isHvac&&<a href="#hvac-equipment">HVAC Equipment <b>{hvacEquipment?.length??0}</b></a>}<a href="#jobs">Jobs <b>{jobs?.length??0}</b></a><span>Invoices</span><span>Notes</span><span>Activity</span></nav>
  <div className="customer-record-columns"><div className="customer-record-main">
   <div className="crm-detail-grid"><section className="workspace-panel contact-information-card"><div className="panel-title contact-information-heading"><div><h2>Contact information</h2><span className={`contact-status-pill ${customer.is_active?"active":"inactive"}`}>{customer.is_active?"Active":"Inactive"}</span></div>{canEdit&&<Link className="primary-location-edit" href={`/app/${businessSlug}/customers/${customerId}/edit`}><span>Edit</span><b aria-hidden="true">✎</b></Link>}</div><div className="contact-information-details"><div className="contact-detail-row"><i aria-hidden="true">✉️</i><div><strong>Email</strong><p>{customer.email||"Not provided"}</p></div></div><div className="contact-detail-row"><i aria-hidden="true">📞</i><div><strong>Primary phone</strong><p>{customer.phone||"Not provided"}</p></div></div>{customer.secondary_phone&&<div className="contact-detail-row"><i aria-hidden="true">☎️</i><div><strong>Secondary phone</strong><p>{customer.secondary_phone}</p></div></div>}<div className="contact-detail-row"><i aria-hidden="true">💬</i><div><strong>Contact preference</strong><p>{customer.preferred_contact_method||"Not recorded"}</p></div></div><div className="contact-detail-row"><i aria-hidden="true">🧭</i><div><strong>Lead source</strong><p>{customer.lead_source||"Not recorded"}</p></div></div></div></section>
   <section className="workspace-panel primary-location-card" id="locations">
    <div className="panel-title primary-location-heading">
     <div><h2>Primary location</h2>{primary?.is_primary&&<span>Primary</span>}</div>
     {primary&&<div className="primary-location-actions">
      <a className="primary-map-button" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(primaryAddress)}`} target="_blank" rel="noreferrer">
       <CustomerActionIcon name="location"/> <span>Open map</span> <b aria-hidden="true">↗</b>
      </a>
      {canEdit&&<ServiceLocationDrawer
       title="Edit service location"
       trigger={<><span>Edit</span><b aria-hidden="true">✎</b></>}
       triggerClassName="primary-location-edit"
       action={saveServiceLocation.bind(null,businessSlug,customerId,primary.id)}
       location={primary}
       googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY?process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:undefined}
      />}
     </div>}
    </div>
    {primary?<div className="customer-primary-location">
     <div className="primary-location-column primary-location-details">
      <div className="location-detail-row address">
       <i className="location-svg" aria-hidden="true"><CustomerActionIcon name="location"/></i>
       <div>
        <strong>{primary.location_name||"Service location"}</strong>
        <p>{primary.street_address}{primary.unit?`, ${primary.unit}`:""}<br/>{primary.city}, {primary.state} {primary.postal_code}</p>
        <span>{["verified","manual"].includes(String(primary.geocoding_status))?"✓ Address verified":String(primary.geocoding_status??"Address not verified")}</span>
       </div>
      </div>
      <div className="location-detail-row">
       <i aria-hidden="true">🔐</i>
       <div><strong>Access instructions</strong><p>{primary.access_instructions||"No access instructions"}{primary.gate_code&&<><br/><b>Gate code:</b> {primary.gate_code}</>}</p></div>
      </div>
      <div className="location-detail-row">
       <i aria-hidden="true">🅿️</i>
       <div><strong>Parking notes</strong><p>{primary.parking_notes||"No parking notes"}</p></div>
      </div>
      <div className="location-detail-row">
       <i aria-hidden="true">🏠</i>
       <div><strong>Property notes</strong><p>{primary.property_notes||"No property notes"}</p></div>
      </div>
     </div>
     <div className="primary-location-column primary-location-assignment">
      <div className="location-detail-row">
       <i aria-hidden="true">🗺️</i>
       <div><strong>Territory</strong><p>{assignedTerritory?.name||"Not assigned"}</p></div>
      </div>
      <div className="location-detail-row">
       <i aria-hidden="true">🧑‍🔧</i>
       <div><strong>Default technician</strong><p>{assignedTechnician?.preferred_name||"Not assigned"}</p></div>
      </div>
     </div>
    </div>:<div className="dashboard-empty">
     <strong>No service location</strong>
     <p>Add a location before creating a service plan.</p>
     {canEdit&&<ServiceLocationDrawer title="Add service location" trigger="Add service location" triggerClassName="sv-button" action={saveServiceLocation.bind(null,businessSlug,customerId,null)} location={{location_name:"Home",is_primary:true,is_active:true,country:"US"}} googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY?process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:undefined}/>}
    </div>}
   </section>
   </div>
   {isHvac&&<CustomerHvacEquipment equipment={hvacEquipment??[]} locations={(locations??[]).map(location=>({id:location.id,location_name:location.location_name,street_address:location.street_address}))} canEdit={canEdit} createAction={createCustomerHvacEquipment.bind(null,businessSlug,customerId)} updateAction={equipmentId=>updateCustomerHvacEquipment.bind(null,businessSlug,customerId,equipmentId)} archiveAction={equipmentId=>archiveCustomerHvacEquipment.bind(null,businessSlug,customerId,equipmentId)}/>}
   {isPool&&<PoolServiceHistory logs={(poolLogs??[]).map(log=>({...log,employees:log.technician_profiles}))} chemicals={poolLogChemicals??[]} tasks={poolLogTasks??[]} photos={poolPhotos} ranges={poolRanges??[]} timezone={business.timezone}/>}
   <MissedCallTranscript messages={recoveryMessages??[]} timeZone={business.timezone}/>
   <section className="workspace-panel" id="jobs"><div className="panel-title"><div><h2>Recent jobs</h2><span>{jobs?.length??0} total</span></div><Link href={`/app/${businessSlug}/jobs?customerId=${customerId}`}>View all jobs</Link></div>{recentJobs.length?<div className="customer-job-history">{recentJobs.map(job=><Link key={job.id} href={`/app/${businessSlug}/jobs/${job.id}`}><span>{job.work_completed_at||job.starts_at?formatBusinessDate(job.work_completed_at??job.starts_at!,business.timezone):"Not scheduled"}</span><strong>{job.title}</strong><span className={`job-status ${job.status}`}>{job.status.replaceAll("_"," ")}</span><b>${Number(job.total_amount??0).toFixed(2)}</b></Link>)}</div>:<p className="muted">No jobs have been created for this customer.</p>}</section>
  </div><aside className="customer-record-aside">
   <section className="workspace-panel customer-side-card customer-billing-preferences">
    <div className="panel-title"><h2>Billing preferences</h2><span className="customer-billing-pill">{billingMethodLabel}</span></div>
    <dl><div><dt>Settings source</dt><dd>{usesBillingDefaults?"Business defaults":"Customer-specific"}</dd></div><div><dt>Payment terms</dt><dd>{paymentTerms===0?"Due immediately":paymentTerms?`Net ${paymentTerms}`:"Not configured"}</dd></div><div><dt>Invoice delivery</dt><dd>{autoSend?"Send automatically":"Review before sending"}</dd></div><div><dt>Autopay</dt><dd>{billingProfile?.autopay_enabled?"Enabled":"Off"}</dd></div><div><dt>Billing email</dt><dd>{billingProfile?.billing_email||customer.email||"Not provided"}</dd></div></dl>
    {billingProfile?.billing_notes&&<p><strong>Notes</strong>{billingProfile.billing_notes}</p>}
   </section>
   <section className="workspace-panel customer-side-card">
    <div className="panel-title"><h2>Upcoming service</h2>{nextService&&<span className="employee-state active">{nextService.status}</span>}</div>
    {nextService?<article className="upcoming-service-card">
     <strong>{nextService.title}</strong>
     <p><i aria-hidden="true"><CustomerActionIcon name="calendar"/></i>{formatBusinessDate(nextService.starts_at!,business.timezone)}</p>
     <p><i aria-hidden="true"><CustomerActionIcon name="clock"/></i>{formatBusinessDateTime(nextService.starts_at!,business.timezone)}</p>
     <Link href={`/app/${businessSlug}/jobs/${nextService.id}`}>View upcoming job</Link>
    </article>:<p>No upcoming visit is currently scheduled.</p>}
   </section>
   <section className="workspace-panel customer-side-card">
    <div className="panel-title"><h2>Recent activity</h2><Link href={`/app/${businessSlug}/jobs?customerId=${customerId}`}>View all</Link></div>
   <div className="customer-activity-feed">
     {[...upcoming.slice(0,2),...history.slice(0,3)].slice(0,4).map(job=><Link href={`/app/${businessSlug}/jobs/${job.id}`} key={job.id}>
      <i className={job.status==="completed"?"complete":"scheduled"}><CustomerActionIcon name={job.status==="completed"?"check":"calendar"}/></i>
      <span><strong>{job.status==="completed"?"Service completed":"Job scheduled"}</strong><small>{job.title}</small></span>
      <time>{formatBusinessDate(job.work_completed_at??job.starts_at!,business.timezone)}</time>
     </Link>)}
     {!jobs?.length&&<p>No recent activity.</p>}
    </div>
   </section>
   <section className="workspace-panel customer-service-plans customer-side-card" id="service-plans">
    <div className="panel-title">
     <div><h2>Service plans</h2><span>{activePlans.length} active</span></div>
     {canEdit&&<ServicePlanDrawer customerName={name} locations={(locations??[]).map(location=>({id:location.id,name:location.location_name||location.street_address}))} services={(services??[]).map(service=>({id:service.id,name:service.name,price_amount:service.price_amount}))} employees={(employees??[]).map(employee=>({id:employee.id,name:employee.preferred_name}))} defaultStartDate={dateInTimeZone(new Date(),business.timezone)} action={createServicePlan.bind(null,businessSlug,customerId)}/>}
    </div>
    {activePlans.length?<div className="customer-plan-list">{activePlans.map(plan=><article key={plan.id}>
     <i className="plan-repeat-icon"><CustomerActionIcon name="repeat"/></i>
     <div><strong>{plan.name}</strong><span>{plan.cadence_interval===1?`${plan.cadence_unit}ly`:`Every ${plan.cadence_interval} ${plan.cadence_unit}s`} · ${Number(plan.recurring_price).toFixed(2)} / visit</span></div>
     <b className="employee-state active">Active</b>
     {canEdit&&<ServicePlanRowMenu plan={{...plan,recurring_price:Number(plan.recurring_price)}} locations={(locations??[]).map(location=>({id:location.id,name:location.location_name||location.street_address}))} services={(services??[]).map(service=>({id:service.id,name:service.name}))} employees={(employees??[]).map(employee=>({id:employee.id,name:employee.preferred_name}))} skipAction={skipNextServicePlanOccurrence.bind(null,businessSlug,customerId,plan.id)} updateAction={updateServicePlan.bind(null,businessSlug,customerId,plan.id)} deleteAction={deleteServicePlan.bind(null,businessSlug,customerId,plan.id)}/>}
    </article>)}</div>:<div className="dashboard-empty"><strong>No active service plans</strong><p>Add a recurring plan for this customer.</p></div>}
   </section>
  </aside></div>
 </section></main>;
}
