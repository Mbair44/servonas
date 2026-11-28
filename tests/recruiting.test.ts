import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {canManageRecruiting} from "../lib/access.ts";
import {defaultRecruitingSettings,isJobApplicationStatus,isJobPostingStatus,normalizeJobSlug,validateResumeMetadata} from "../lib/recruiting.ts";

const migration=()=>readFile(join(process.cwd(),"supabase/migrations/20261127000100_recruiting_foundation.sql"),"utf8");

test("recruiting defaults careers to disabled for each tenant",()=>{
 const settings=defaultRecruitingSettings("11111111-1111-1111-1111-111111111111");
 assert.equal(settings.careersEnabled,false);
 assert.equal(settings.applicantRetentionDays,365);
 assert.equal(settings.notificationEmail,null);
});

test("recruiting access excludes managers, staff, technicians, and anonymous users",()=>{
 assert.equal(canManageRecruiting("owner"),true);
 assert.equal(canManageRecruiting("admin"),true);
 for(const role of ["manager","staff","technician",null,undefined])assert.equal(canManageRecruiting(role),false);
});

test("recruiting validation accepts only declared statuses and safe resume metadata",()=>{
 assert.equal(isJobPostingStatus("published"),true);
 assert.equal(isJobPostingStatus("open"),false);
 assert.equal(isJobApplicationStatus("withdrawn"),true);
 assert.equal(isJobApplicationStatus("pending"),false);
 assert.equal(normalizeJobSlug(" Delivery & Operations Lead "),"delivery-operations-lead");
 assert.equal(validateResumeMetadata({name:"resume.pdf",type:"application/pdf",size:5*1024*1024}),null);
 assert.match(validateResumeMetadata({name:"resume.exe",type:"application/octet-stream",size:1})??"",/PDF, DOC, or DOCX/);
 assert.match(validateResumeMetadata({name:"resume.pdf",type:"application/pdf",size:5*1024*1024+1})??"",/5 MB/);
});

test("recruiting migration enforces tenant isolation, append-only status history, and private resume storage",async()=>{
 const sql=await migration();
 assert.match(sql,/unique\(business_id,slug\)/);
 assert.match(sql,/status text not null default 'draft' check\(status in\('draft','published','closed'\)\)/);
 assert.match(sql,/status text not null default 'new' check\(status in\('new','under_review','interview','offer_extended','hired','rejected','withdrawn'\)\)/);
 assert.match(sql,/foreign key\(business_id,job_posting_id\) references public\.job_postings\(business_id,id\)/);
 assert.match(sql,/foreign key\(business_id,application_id\) references public\.job_applications\(business_id,id\)/);
 assert.match(sql,/resume_storage_path like business_id::text \|\| '\/' \|\| id::text \|\| '\/%'/);
 assert.match(sql,/alter table public\.job_applications enable row level security/);
 assert.match(sql,/for all to authenticated using\(public\.has_business_role\(business_id,array\[''owner'',''admin''\]\)\)/);
 assert.match(sql,/create policy "recruiting owners admins read status history"/);
 assert.doesNotMatch(sql,/status history" on public\.job_application_status_history for insert/);
 assert.match(sql,/values\('application-resumes','application-resumes',false,5242880/);
 assert.match(sql,/bucket_id='application-resumes' and public\.has_business_role\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid,array\['owner','admin'\]\)/);
 assert.match(sql,/submitted_ip_hash text/);
 assert.doesNotMatch(sql,/raw_ip/);
});
