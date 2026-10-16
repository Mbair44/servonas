import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
test("bundle builder is tenant-scoped and only creates drafts",()=>{const actions=read("app/app/[businessSlug]/marketing/bundles/actions.ts"),page=read("app/app/[businessSlug]/marketing/bundles/page.tsx");assert.match(actions,/requireWorkspace\(slug\)/);assert.match(actions,/canManageBusiness\(role\)/);assert.match(actions,/eq\("business_id",business\.id\)/);assert.match(actions,/status:"draft"/);assert.match(actions,/eq\("status","draft"\)/);assert.match(actions,/eq\("active",true\)/);assert.match(page,/Public bundle booking remains off/);});
test("bundle preview shares the checkout resolver and never starts checkout",()=>{const builder=read("app/app/[businessSlug]/marketing/bundles/BundleBuilder.tsx");assert.match(builder,/resolveRentalBundle/);assert.match(builder,/Preview weekday price/);assert.doesNotMatch(builder,/api\/checkout|stripe\.checkout/);});
