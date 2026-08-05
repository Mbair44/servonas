import Link from "next/link";
import {requireWorkspace} from "@/lib/workspace";
import {canManageCustomers} from "@/lib/access";
import {WorkspaceNav} from "../../WorkspaceNav";
import {CustomerImportUpload} from "./CustomerImportUpload";

export default async function CustomerImportsPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,query=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug);
 const [{count:customerCount},{count:locationCount},{data:imports,error}]=await Promise.all([
  supabase.from("customers").select("id",{count:"exact",head:true}).eq("business_id",business.id).eq("is_deleted",false),
  supabase.from("service_locations").select("id",{count:"exact",head:true}).eq("business_id",business.id).eq("is_deleted",false),
  supabase.from("customer_imports").select("id,file_name,status,current_stage,total_row_count,imported_customer_count,imported_location_count,failed_row_count,last_activity_at,created_at").eq("business_id",business.id).order("created_at",{ascending:false}).limit(10),
 ]);
 const missing=error?.code==="42P01"||error?.code==="42703",active=(imports??[]).find(item=>!["completed","completed_with_errors","failed","canceled","rolled_back","rollback_partial"].includes(item.status)),failed=(imports??[]).reduce((sum,item)=>sum+item.failed_row_count,0);
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content customer-import-page">
  <header className="epic3-header"><div><small>Customer migration</small><h1>Bring your customers to Servonas</h1><p>Use the spreadsheet you already have. Review and correct everything before anything is imported.</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/customers`}>Back to Customers</Link></header>
  {query.error&&<p className="form-error" role="alert">{query.error}</p>}{query.success&&<p className="form-success" role="status">{query.success}</p>}
  <section className="customer-import-metrics" aria-label="Customer migration summary"><article><span>Customers</span><strong>{customerCount??0}</strong><small>Currently in Servonas</small></article><article><span>Service locations</span><strong>{locationCount??0}</strong><small>Active and historical properties</small></article><article><span>Needs attention</span><strong>{failed}</strong><small>Failed import records</small></article></section>
  {missing?<section className="workspace-panel"><h2>Customer migration setup is required</h2><p>Apply the Epic 2.3 Checkpoints 1–4 migration before uploading customer files.</p></section>:<>
   {active&&<section className="workspace-panel import-resume"><div><small>Continue where you left off</small><h2>{active.file_name}</h2><p>{active.total_row_count.toLocaleString()} source rows · Last updated {new Date(active.last_activity_at).toLocaleString()}</p></div><Link className="sv-button" href={`/app/${businessSlug}/customers/imports/${active.id}`}>Resume import</Link></section>}
   {canManageCustomers(role)&&<CustomerImportUpload businessSlug={businessSlug}/>}
   <section className="workspace-panel import-history"><div className="panel-title"><h2>Recent migrations</h2><span>{imports?.length??0} shown</span></div>{imports?.length?<div className="import-history-list">{imports.map(item=><Link href={`/app/${businessSlug}/customers/imports/${item.id}`} key={item.id}><div><strong>{item.file_name}</strong><span>{new Date(item.created_at).toLocaleDateString()} · {item.total_row_count} rows</span><small>{item.imported_customer_count} customers · {item.imported_location_count} locations · {item.failed_row_count} failed</small></div><span className="status-badge">{item.status.replaceAll("_"," ")}</span></Link>)}</div>:<div className="sv-empty"><h3>No customer migrations yet</h3><p>Upload a file, review what Servonas finds, and import when you are confident.</p></div>}</section>
  </>}
  <section className="workspace-panel customer-import-assurance"><h2>Designed for safe pilot migration</h2><div><p><strong>Nothing is imported until review.</strong><br/>Mappings, groups, addresses, duplicates, and updates are shown first.</p><p><strong>Existing records are protected.</strong><br/>Servonas never overwrites a customer automatically.</p><p><strong>Partial success is recoverable.</strong><br/>Valid records can proceed while failed records remain available to correct.</p></div><nav><Link href="/api/customer-imports/template">Download template</Link><Link href={`/app/${businessSlug}/customers/new`}>Add one customer manually</Link></nav><small>Customer migration is included with your active Servonas entitlement. No payment method is required.</small></section>
 </section></main>;
}
