import Link from "next/link";
import {notFound} from "next/navigation";
import {requireWorkspace} from "@/lib/workspace";
import {employeeImportStageLabel} from "@/lib/employeeImport/lifecycle";
import {normalizeMappingHeader,type EmployeeColumnMapping} from "@/lib/employeeImport/mapping";
import {WorkspaceNav} from "../../../WorkspaceNav";
import {cancelEmployeeImport,saveEmployeeImportMappings} from "../actions";
import {ColumnMappingForm} from "./ColumnMappingForm";

type ImportSession={
  id:string;file_name:string;file_extension:string;file_size_bytes:number;status:string;current_stage:string;
  total_row_count:number;valid_row_count:number;warning_row_count:number;invalid_row_count:number;
  duplicate_row_count:number;imported_row_count:number;failed_row_count:number;version:number;
  created_at:string;last_activity_at:string;completed_at:string|null;canceled_at:string|null;
  rollback_status:string;source_columns:{name:string;sampleValues?:string[]}[];
};
const terminal=new Set(["completed","completed_with_errors","failed","canceled","rolled_back"]);

export default async function EmployeeImportSessionPage({params,searchParams}:{params:Promise<{businessSlug:string;importId:string}>;searchParams:Promise<Record<string,string|undefined>>}){
  const {businessSlug,importId}=await params,{business,supabase}=await requireWorkspace(businessSlug),query=await searchParams;
  const {data,error}=await supabase.from("employee_imports").select("id,file_name,file_extension,file_size_bytes,status,current_stage,total_row_count,valid_row_count,warning_row_count,invalid_row_count,duplicate_row_count,imported_row_count,failed_row_count,version,created_at,last_activity_at,completed_at,canceled_at,rollback_status,source_columns").eq("business_id",business.id).eq("id",importId).maybeSingle();
  if(error){
    console.error("Employee import session load failed",{businessId:business.id,importId,code:error.code});
    if(error.code==="42703"||error.code==="42P01") return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content"><div className="workspace-notice error">Apply the Epic 2.2 Checkpoint 4 migration to resume imports.</div></section></main>;
    throw new Error("The import session could not be loaded.");
  }
  if(!data) notFound();
  const session=data as ImportSession,active=!terminal.has(session.status);
  const [{data:savedMappings,error:mappingError},{data:profiles,error:profileError}]=await Promise.all([
    supabase.from("employee_import_column_mappings").select("source_column,source_ordinal,destination_field,transformation,confidence,is_ignored").eq("business_id",business.id).eq("import_id",session.id).order("source_ordinal"),
    supabase.from("employee_import_mapping_profiles").select("id,name,normalized_headers,mappings,last_used_at").eq("business_id",business.id).order("last_used_at",{ascending:false}).limit(20),
  ]);
  const checkpointMissing=[mappingError,profileError].some(item=>item?.code==="42P01"||item?.code==="42703");
  if((mappingError||profileError)&&!checkpointMissing) console.error("Employee import mapping data load failed",{businessId:business.id,importId,codes:[mappingError?.code,profileError?.code]});
  const persisted:EmployeeColumnMapping[]=(savedMappings??[]).map(mapping=>({
    sourceColumn:mapping.source_column,sourceOrdinal:mapping.source_ordinal,destinationField:mapping.destination_field,
    transformation:mapping.transformation,confidence:mapping.confidence,isIgnored:mapping.is_ignored,
  }));
  const normalizedHeaders=session.source_columns.map(column=>normalizeMappingHeader(column.name));
  const matchingProfile=(profiles??[]).find(profile=>JSON.stringify(profile.normalized_headers)===JSON.stringify(normalizedHeaders));
  const initialMappings=persisted.length?persisted:(matchingProfile?.mappings as EmployeeColumnMapping[]|undefined);
  const counts=[
    ["Rows",session.total_row_count],["Ready",session.valid_row_count],["Warnings",session.warning_row_count],
    ["Needs attention",session.invalid_row_count],["Duplicates",session.duplicate_row_count],["Imported",session.imported_row_count],["Failed",session.failed_row_count],
  ] as const;
  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content workforce-page">
    <header className="epic3-header"><div><small>Employee import</small><h1>{session.file_name}</h1><p>Last saved {new Date(session.last_activity_at).toLocaleString()}</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/team/imports`}>All imports</Link></header>
    {query.error&&<p className="form-error" role="alert">{query.error}</p>}{query.success&&<p className="form-success" role="status">{query.success}</p>}
    <section className="workspace-panel import-session-hero"><div><span className={`import-session-state ${session.status}`}>{session.status.replaceAll("_"," ")}</span><h2>{employeeImportStageLabel(session.current_stage)}</h2><p>{active?"Your progress is saved. You can safely leave and return to this import.":"This import is no longer active."}</p></div><div><strong>Version {session.version}</strong><span>{(session.file_size_bytes/1024).toFixed(1)} KB · {session.file_extension.toUpperCase()}</span></div></section>
    <section className="import-session-counts" aria-label="Import row counts">{counts.map(([label,count])=><article className="workspace-panel" key={label}><span>{label}</span><strong>{count.toLocaleString()}</strong></article>)}</section>
    <section className="workspace-panel import-session-details"><h2>Session details</h2><dl><div><dt>Started</dt><dd>{new Date(session.created_at).toLocaleString()}</dd></div><div><dt>Current stage</dt><dd>{employeeImportStageLabel(session.current_stage)}</dd></div><div><dt>Source columns</dt><dd>{session.source_columns.length}</dd></div><div><dt>Rollback</dt><dd>{session.rollback_status.replaceAll("_"," ")}</dd></div></dl>
      {matchingProfile&&!persisted.length&&<div className="workspace-notice success">Suggested mappings loaded from “{matchingProfile.name}” because every source header matches. Review them before confirming.</div>}
    </section>
    {active&&["uploaded","mapping"].includes(session.status)&&(checkpointMissing
      ?<section className="workspace-panel"><div className="workspace-notice error">Apply the Epic 2.2 Checkpoint 5 migration to map spreadsheet columns.</div></section>
      :<section className="workspace-panel mapping-workspace"><header><small>Step 2</small><h2>Match your spreadsheet columns</h2><p>Review each suggestion. Nothing is imported and no invitations are sent when you save these mappings.</p></header><ColumnMappingForm sourceColumns={session.source_columns} initialMappings={initialMappings} appliedProfileId={!persisted.length?matchingProfile?.id:undefined} action={saveEmployeeImportMappings.bind(null,businessSlug,session.id)}/></section>)}
    {active&&<section className="workspace-panel import-danger-zone"><div><h2>Cancel this import</h2><p>The private source file remains available for the retention period, but no employees will be created.</p></div><form action={cancelEmployeeImport.bind(null,businessSlug,session.id)}><input type="hidden" name="version" value={session.version}/><input type="hidden" name="stage" value={session.current_stage}/><button className="sv-button sv-danger" type="submit">Cancel import</button></form></section>}
  </section></main>;
}
