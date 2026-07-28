import test from "node:test";
import assert from "node:assert/strict";
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
