import Link from "next/link";
import {requireWorkspace} from "@/lib/workspace";
import {WorkspaceNav} from "../../WorkspaceNav";
import {EmployeeImportUpload} from "./EmployeeImportUpload";

export default async function EmployeeImportsPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug}=await params,{business,supabase}=await requireWorkspace(businessSlug),query=await searchParams;
 const page=Math.max(1,Number(query.page)||1),pageSize=20,from=(page-1)*pageSize;
 const {data:imports,error,count}=await supabase.from("employee_imports").select("id,file_name,total_row_count,status,current_stage,uploaded_by,created_at,completed_at,imported_row_count,failed_row_count,rollback_status,metadata",{count:"exact"}).eq("business_id",business.id).order("created_at",{ascending:false}).range(from,from+pageSize-1);
 const uploaderIds=[...new Set((imports??[]).map(item=>item.uploaded_by))],importIds=(imports??[]).map(item=>item.id);
 const [{data:uploaders},{data:historyRows}]=await Promise.all([
  uploaderIds.length?supabase.from("profiles").select("id,email,full_name").in("id",uploaderIds):Promise.resolve({data:[]}),
  importIds.length?supabase.from("employee_import_rows").select("import_id,commit_status,invitation_status").eq("business_id",business.id).in("import_id",importIds):Promise.resolve({data:[]}),
 ]);
 const migrationMissing=error?.code==="42P01"||error?.code==="42703";
 if(error&&!migrationMissing) console.error("Employee import history failed",{businessId:business.id,code:error.code});
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content workforce-page"><header className="epic3-header"><div><small>Team activation</small><h1>Employee imports</h1><p>Bring your employee roster into Servonas without granting login access.</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/team`}>Back to Team</Link></header>
 {query.error&&<p className="form-error" role="alert">{query.error}</p>}{query.success&&<p className="form-success" role="status">{query.success}</p>}
 {migrationMissing?<section className="workspace-panel team-import-empty"><h2>Import setup is required</h2><p>Apply the Epic 2.2 Checkpoint 3 migration before uploading employee files.</p></section>:<EmployeeImportUpload businessSlug={businessSlug}/>}
 {!!imports?.length&&<section className="workspace-panel import-history"><h2>Import history</h2><div className="import-history-list">{imports.map(item=>{const uploader=uploaders?.find(profile=>profile.id===item.uploaded_by),rows=(historyRows??[]).filter(row=>row.import_id===item.id),updated=rows.filter(row=>row.commit_status==="updated").length,skipped=rows.filter(row=>row.commit_status==="skipped").length,invitations=rows.filter(row=>["sent","accepted"].includes(row.invitation_status)).length;return <Link href={`/app/${businessSlug}/team/imports/${item.id}`} key={item.id}><div><strong>{item.file_name}</strong><span>Uploaded by {uploader?.full_name||uploader?.email||"authorized owner"} · {new Date(item.created_at).toLocaleDateString()}</span><small>{item.total_row_count} total · {item.imported_row_count} imported · {updated} updated · {skipped} skipped · {item.failed_row_count} failed · {invitations} invitations sent</small><small>{item.completed_at?`Completed ${new Date(item.completed_at).toLocaleDateString()}`:"In progress"} · Rollback {item.rollback_status.replaceAll("_"," ")}</small></div><span className="status-badge">{item.current_stage==="mapping"?"Ready for matching":item.status.replaceAll("_"," ")}</span></Link>})}</div>{(count??0)>pageSize&&<nav className="import-history-pagination" aria-label="Import history pages">{page>1&&<Link className="sv-button sv-secondary" href={`?page=${page-1}`}>Previous</Link>}<span>Page {page} of {Math.ceil((count??0)/pageSize)}</span>{from+pageSize<(count??0)&&<Link className="sv-button sv-secondary" href={`?page=${page+1}`}>Next</Link>}</nav>}</section>}
 </section></main>;
}
