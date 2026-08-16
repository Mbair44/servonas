import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("platform email campaigns are admin-only, auditable, idempotent, and unsubscribeable",async()=>{
 const [action,composer,migration,unsubscribe]=await Promise.all([
  readFile("app/admin/actions.ts","utf8"),readFile("app/admin/PlatformEmailComposer.tsx","utf8"),readFile("supabase/migrations/20260816000100_platform_email_campaigns.sql","utf8"),readFile("app/platform-unsubscribe/[token]/actions.ts","utf8"),
 ]);
 assert.match(action,/isServonasPlatformAdmin/);
 assert.match(action,/send_token/);
 assert.match(action,/platform_email_opt_outs/);
 assert.match(action,/List-Unsubscribe/);
 assert.match(composer,/I understand this sends immediately/);
 assert.match(composer,/const formElement=event\.currentTarget,form=new FormData\(formElement\)/);
 assert.match(composer,/try\{const result=await sendPlatformEmailCampaign\(form\)/);
 assert.match(composer,/setSendToken\(crypto\.randomUUID\(\)\)/);
 assert.match(migration,/create table if not exists public\.platform_email_campaigns/);
 assert.match(migration,/create table if not exists public\.platform_email_recipients/);
 assert.match(unsubscribe,/platform_email_opt_outs/);
});
