import Link from "next/link";
import {requireWorkspace} from "@/lib/workspace";
import {WorkspaceNav} from "../../WorkspaceNav";

export default async function EmployeeImportsPage({params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,{business}=await requireWorkspace(businessSlug);
 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name}/><section className="epic3-content workforce-page"><header className="epic3-header"><div><small>Team activation</small><h1>Employee imports</h1><p>Upload history and resumable team imports will appear here.</p></div><Link className="sv-button sv-secondary" href={`/app/${businessSlug}/team`}>Back to Team</Link></header><section className="workspace-panel team-import-empty"><span aria-hidden="true">⇧</span><h2>No employee imports yet</h2><p>The spreadsheet import workflow is the next Epic 2.2 checkpoint. You can add employees manually now without granting login access.</p><Link className="sv-button" href={`/app/${businessSlug}/team#add-employee`}>Add an employee</Link></section></section></main>;
}
