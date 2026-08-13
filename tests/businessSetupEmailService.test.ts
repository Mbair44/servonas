import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {businessSetupEmailContent} from "../lib/communications/businessSetupEmailService.ts";

test("business setup notification identifies the new workspace",()=>{
  const content=businessSetupEmailContent({
    businessId:"business-123",
    businessName:"Matthew & Sons",
    businessSlug:"matthew-sons",
    businessEmail:"office@example.com",
    creatorEmail:"owner@example.com",
  },"https://app.servonas.com/");

  assert.match(content.subject,/Matthew & Sons/);
  assert.match(content.text,/Workspace: matthew-sons/);
  assert.match(content.text,/https:\/\/app\.servonas\.com\/app\/matthew-sons/);
  assert.match(content.html,/Matthew &amp; Sons/);
  assert.doesNotMatch(content.html,/Matthew & Sons/);
});

test("website-first workspace creation sends the same setup notification before redirecting",async()=>{
  const source=await readFile(new URL("../app/onboarding/actions.ts",import.meta.url),"utf8");
  const websiteFirstAction=source.slice(
    source.indexOf("export async function createWebsiteFirstWorkspace"),
    source.indexOf("export async function saveWebsiteFirstStyle"),
  );

  assert.match(websiteFirstAction,/await sendBusinessSetupNotification\(\{/);
  assert.match(websiteFirstAction,/businessId:created\?\.id/);
  assert.match(websiteFirstAction,/businessName:name/);
  assert.match(websiteFirstAction,/businessSlug:created\?\.slug\?\?slug/);
  assert.match(websiteFirstAction,/businessEmail:email/);
  assert.ok(
    websiteFirstAction.indexOf("await sendBusinessSetupNotification")<websiteFirstAction.lastIndexOf("redirect("),
    "notification must be attempted before navigation",
  );
});
