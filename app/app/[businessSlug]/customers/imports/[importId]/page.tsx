import Link from "next/link";
import {notFound} from "next/navigation";
import {requireWorkspace} from "@/lib/workspace";
import {WorkspaceNav} from "../../../WorkspaceNav";
import {selectCustomerImportWorksheet} from "../actions";

export default async function CustomerImportSessionPage({params,searchParams}:{params:Promise<{businessSlug:string;importId:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {businessSlug,importId}=await params,query=await searchParams,{supabase,business}=await requireWorkspace(businessSlug);
 const {data:session,error}=await supabase.from("customer_imports").select("*").eq("business_id",business.id).eq("id",importId).maybeSingle();if(error||!session)notFound();
 const worksheets=(session.worksheets??[]) as {name:string;state:string;rowCount:number}[];
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content customer-import-page">
  <header className="epic3-header"><div><small>Customer migration · {session.current_stage.replaceAll("_"," ")}</small><h1>{session.file_name}</h1><p>{session.total_row_count.toLocaleString()} source rows · Nothing has been imported yet.</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/customers/imports`}>All migrations</Link></header>
  {query.error&&<p className="form-error" role="alert">{query.error}</p>}{query.success&&<p className="form-success" role="status">{query.success}</p>}
  {session.current_stage==="worksheet"?<section className="workspace-panel"><small>Workbook review</small><h2>Choose the worksheet with your customer data</h2><p>Servonas never combines worksheets automatically. Hidden worksheets are labeled so you can make the choice.</p><form action={selectCustomerImportWorksheet.bind(null,businessSlug,importId)}><fieldset className="worksheet-list"><legend className="sr-only">Worksheet</legend>{worksheets.map((sheet,index)=><label key={sheet.name}><input required type="radio" name="worksheet" value={sheet.name} defaultChecked={index===0&&sheet.state==="visible"}/><span><strong>{sheet.name}</strong><small>{sheet.rowCount.toLocaleString()} possible data rows · {sheet.state}</small></span></label>)}</fieldset><button className="sv-button">Use selected worksheet</button></form></section>:<section className="workspace-panel"><small>Next: column mapping</small><h2>Your file is ready</h2><p>Servonas found {session.source_columns.length} columns in {session.worksheet_name?`“${session.worksheet_name}”`:"the CSV"}. Checkpoint 5 will provide automatic matching and manual mapping here.</p><div className="import-source-columns">{(session.source_columns as {name:string;sampleValues:string[]}[]).slice(0,12).map(column=><span key={column.name}>{column.name}</span>)}</div></section>}
 </section></main>;
}
