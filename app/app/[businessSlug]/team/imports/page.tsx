import Link from "next/link";
import {requireWorkspace} from "@/lib/workspace";
import {WorkspaceNav} from "../../WorkspaceNav";
import {EmployeeImportUpload} from "./EmployeeImportUpload";

export default async function EmployeeImportsPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,{business,supabase}=await requireWorkspace(businessSlug),query=await searchParams;
 const {data:imports,error}=await supabase.from("employee_imports").select("id,file_name,total_row_count,status,current_stage,created_at").eq("business_id",business.id).order("created_at",{ascending:false}).limit(10);
 const migrationMissing=error?.code==="42P01"||error?.code==="42703";
 if(error&&!migrationMissing) console.error("Employee import history failed",{businessId:business.id,code:error.code});
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content workforce-page"><header className="epic3-header"><div><small>Team activation</small><h1>Employee imports</h1><p>Bring your employee roster into Servonas without granting login access.</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/team`}>Back to Team</Link></header>
 {query.error&&<p className="form-error" role="alert">{query.error}</p>}{query.success&&<p className="form-success" role="status">{query.success}</p>}
 {migrationMissing?<section className="workspace-panel team-import-empty"><h2>Import setup is required</h2><p>Apply the Epic 2.2 Checkpoint 3 migration before uploading employee files.</p></section>:<EmployeeImportUpload businessSlug={businessSlug}/>}
 {!!imports?.length&&<section className="workspace-panel import-history"><h2>Recent imports</h2><div className="import-history-list">{imports.map(item=><article key={item.id}><div><strong>{item.file_name}</strong><span>{item.total_row_count.toLocaleString()} rows · {new Date(item.created_at).toLocaleDateString()}</span></div><span className="status-badge">{item.current_stage==="mapping"?"Ready for matching":item.status}</span></article>)}</div></section>}
 </section></main>;
}
