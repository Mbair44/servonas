import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("billing page keeps tax setup separate from payment setup",async()=>{
 const [dashboard,settingsContent,actions]=await Promise.all([
  read("components/SettingsDashboard.tsx"),
  read("app/app/[businessSlug]/settings/SettingsContent.tsx"),
  read("app/app/[businessSlug]/settings/actions.ts"),
 ]);
 assert.match(dashboard,/id="payments"/);
 assert.match(dashboard,/id="taxes"/);
 assert.match(dashboard,/title="Sales tax"/);
 assert.match(dashboard,/drawer==="taxes"/);
 assert.match(dashboard,/taxSettingsAction/);
 assert.match(dashboard,/Save tax settings/);
 assert.doesNotMatch(dashboard,/Customer invoice payment options[\s\S]*<h3>Sales tax<\/h3>/);
 assert.match(settingsContent,/taxSettingsAction=\{updateTaxSettings\.bind\(null,businessSlug\)\}/);
 assert.match(actions,/export async function updateTaxSettings/);
 assert.doesNotMatch(actions,/updateInvoicePaymentOptions[\s\S]*tax_enabled:formData\.get\("taxEnabled"\)==="on"/);
});
