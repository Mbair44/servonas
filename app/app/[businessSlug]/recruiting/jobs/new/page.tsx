import Link from "next/link";
import {WorkspaceNav} from "../../../WorkspaceNav";
import {canManageRecruiting} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";
import {RecruitingJobForm} from "../../RecruitingJobForm";
import {saveJobPosting} from "../../actions";
export default async function NewJob({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<{error?:string}>}){const {businessSlug}=await params,q=await searchParams,{business,role}=await requireWorkspace(businessSlug);const allowed=canManageRecruiting(role);return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content"><header className="epic3-header"><div><Link href={`/app/${businessSlug}/recruiting`}>Recruiting</Link><h1>Create Job Posting</h1><p>New postings start as drafts. Public Careers pages are not live yet.</p></div></header>{!allowed?<div className="workspace-notice error">Only owners and administrators can create job postings.</div>:<>{q.error&&<div className="workspace-notice error">{q.error}</div>}<RecruitingJobForm action={saveJobPosting.bind(null,businessSlug,undefined)} /></>}</section></main>;}
