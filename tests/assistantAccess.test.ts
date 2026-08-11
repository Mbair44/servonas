import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("AI Assistant access defaults off and changes are audited atomically",async()=>{const sql=await read("supabase/migrations/20260810000900_business_ai_assistant_access.sql");assert.match(sql,/enabled boolean not null default false/);assert.match(sql,/admin_set_business_ai_assistant_access/);assert.match(sql,/business_ai_assistant_access_audit/);assert.match(sql,/grant execute.+service_role/);assert.match(sql,/revoke insert,update,delete/);});
test("all Assistant reads, writes, and confirmations enforce the server-side paid switch",async()=>{const route=await read("app/api/assistant/[businessSlug]/route.ts"),actions=await read("app/api/assistant/[businessSlug]/actions/[actionId]/route.ts");assert.equal((route.match(/isBusinessAssistantEnabled\(business\.id\)/g)??[]).length,2);assert.match(route,/status:403/);assert.match(actions,/isBusinessAssistantEnabled\(business\.id\)/);assert.match(actions,/status:403/);});
test("disabled workspaces do not render the Assistant ribbon control",async()=>{const popover=await read("components/AssistantPopover.tsx");assert.match(popover,/\/availability/);assert.match(popover,/!accessLoaded\|\|!enabled/);});
test("AI access administration is restricted to Servonas platform admins",async()=>{const page=await read("app/app/admin/ai/page.tsx"),action=await read("app/app/admin/ai/actions.ts");assert.match(page,/isServonasPlatformAdmin/);assert.match(action,/isServonasPlatformAdmin/);assert.match(action,/admin_set_business_ai_assistant_access/);});
