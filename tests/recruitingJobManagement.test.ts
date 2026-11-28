import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {visibleNavigation,workspaceNavigation} from "../lib/workspaceNavigation.ts";

const read=(path:string)=>readFile(join(process.cwd(),path),"utf8");

test("Recruiting navigation is absent unless recruiting authorization is explicitly granted",()=>{
 const slug="tenant-a";
 const unauthorized=visibleNavigation(workspaceNavigation(slug,{recruiting:false}));
 const authorized=visibleNavigation(workspaceNavigation(slug,{recruiting:true}));
 const workforce=(items:typeof authorized)=>items.find(item=>item.id==="workforce")?.children??[];
 assert.equal(workforce(unauthorized).some(item=>item.id==="recruiting"),false);
 const recruiting=workforce(authorized).find(item=>item.id==="recruiting");
 assert.equal(recruiting?.href,`/app/${slug}/recruiting`);
 assert.equal(workforce(authorized).findIndex(item=>item.id==="recruiting"),1);
});

test("job management actions remain server-authorized and tenant-scoped",async()=>{
 const source=await read("app/app/[businessSlug]/recruiting/actions.ts");
 assert.match(source,/canManageRecruiting\(context\.role\)/);
 assert.match(source,/\.eq\("business_id",business\.id\)\.eq\("id",jobId/);
 assert.match(source,/\.eq\("business_id",business\.id\)\.eq\("id",jobId\)\.eq\("status","published"\)/);
 assert.match(source,/existing\.status!=="draft"&&existing\.slug!==value\.slug/);
 assert.match(source,/publishError\(value\)/);
 assert.match(source,/unique job URL is already in use|job URL is already in use/);
 assert.match(source,/employment_type:value\.employmentType/);
 assert.match(source,/compensation_text:value\.compensation\|\|null/);
 assert.doesNotMatch(source,/\.\.\.value,status/);
});

test("dashboard uses actual tenant-scoped application records and withholds public links",async()=>{
 const source=await read("app/app/[businessSlug]/recruiting/page.tsx");
 assert.match(source,/from\("job_applications"\)\.select\("job_posting_id"\)\.eq\("business_id",business\.id\)/);
 assert.match(source,/newAppsResult\.count/);
 assert.match(source,/Public links remain unavailable until Careers routes ship/);
 assert.match(source,/Copy link unavailable/);
});

test("Careers settings are tenant-scoped and make public careers immediately available",async()=>{
 const [settings,actions]=await Promise.all([read("app/app/[businessSlug]/recruiting/settings/page.tsx"),read("app/app/[businessSlug]/recruiting/actions.ts")]);
 assert.match(settings,/Enable public Careers page/);
 assert.match(settings,/website&apos;s <code>\/careers<\/code> address/);
 assert.match(actions,/business_recruiting_settings/);
 assert.match(actions,/\.update\(settings\)\.eq\("business_id",business\.id\)\.select\("business_id"\)\.maybeSingle\(\)/);
 assert.match(actions,/\.insert\(\{business_id:business\.id,\.\.\.settings\}\)/);
 assert.match(actions,/careers_enabled:checked/);
 assert.match(actions,/applicant_retention_days:retention/);
 assert.match(actions,/revalidatePath\("\/sites\/domain\/\[domain\]\/careers","page"\)/);
});

test("edit and close screens protect application history and require confirmation",async()=>{
 const [editor,closeButton,actions]=await Promise.all([read("app/app/[businessSlug]/recruiting/jobs/[jobId]/page.tsx"),read("app/app/[businessSlug]/recruiting/CloseJobButton.tsx"),read("app/app/[businessSlug]/recruiting/actions.ts")]);
 assert.match(editor,/Closing preserves all associated application history/);
 assert.match(actions,/Existing applications were preserved/);
 assert.match(closeButton,/window\.confirm\("Close this published job/);
});
