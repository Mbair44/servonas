import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");

test("merge action is server-authorized and delegates authoritative work to merge RPCs",()=>{
 const actions=read("../app/app/[businessSlug]/customers/actions.ts");
 assert.match(actions,/requireWorkspaceCapability\(slug,"customer_management"\)/);
 assert.match(actions,/canManageBusiness\(role\)/);
 assert.match(actions,/customer_merge_preview/);
 assert.match(actions,/confirm_customer_merge/);
 assert.match(actions,/eq\("business_id",business\.id\)/);
 assert.match(actions,/merged_into_customer_id\?\?row\.id/);
});

test("merge UI requires an explicit confirmation and retains a retry key",()=>{
 const drawer=read("../components/CustomerMergeDrawer.tsx");
 assert.match(drawer,/Merge customer/);
 assert.match(drawer,/Swap primary and duplicate/);
 assert.match(drawer,/Profile values to retain/);
 assert.match(drawer,/crypto\.randomUUID\(\)/);
 assert.match(drawer,/disabled=\{busy\|\|blocked\|\|!confirmed\}/);
 assert.match(drawer,/Retained channels/);
 assert.match(drawer,/resetRequest\(\)/);
 assert.match(drawer,/role="alert"/);
});

test("only an active canonical profile exposes the merge UI",()=>{
 const profile=read("../app/app/[businessSlug]/customers/[customerId]/page.tsx");
 assert.match(profile,/canMerge=canManageBusiness\(role\)&&Boolean\(mergeFeatureEnabled\)&&customer\.is_active&&!customer\.merged_into_customer_id/);
 assert.match(profile,/CustomerMergeDrawer/);
});
