import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("platform admin business setup RPCs use the authenticated session client",async()=>{
 const actions=await read("app/app/admin/businesses/actions.ts");
 assert.match(actions,/const \{ supabase, admin, user \} = await requirePlatformAdminSession\(\);/);
 assert.match(actions,/await supabase\.rpc\("admin_create_business_setup", payload\)/);
 assert.match(actions,/await supabase\.rpc\("admin_update_business_setup", \{/);
 assert.match(actions,/await supabase\.rpc\("admin_mark_owner_invitation_status", \{/);
 assert.doesNotMatch(actions,/await admin\.rpc\("admin_create_business_setup"/);
 assert.doesNotMatch(actions,/await admin\.rpc\("admin_update_business_setup"/);
 assert.doesNotMatch(actions,/await admin\.rpc\("admin_mark_owner_invitation_status"/);
});
