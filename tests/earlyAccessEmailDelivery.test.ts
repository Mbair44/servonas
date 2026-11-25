import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=(file:string)=>readFile(new URL(`../${file}`,import.meta.url),"utf8");

test("email delivery is awaited only after durable lead persistence",async()=>{
 const route=await read("app/api/early-access/route.ts");
 assert.match(route,/async function sendEarlyAccessEmails/);
 assert.match(route,/await fetch\("https:\/\/api\.resend\.com\/emails"/);
 assert.match(route,/if\(persisted\.error\).*return NextResponse/s);
 assert.match(route,/await sendEarlyAccessEmails\(lead/);
 assert.doesNotMatch(route,/void fetch\("https:\/\/api\.resend\.com\/emails/);
});

test("new leads receive one internal notification and one applicant confirmation",async()=>{
 const route=await read("app/api/early-access/route.ts");
 assert.match(route,/to:\[recipient\]/);
 assert.match(route,/to:\[lead\.email\]/);
 assert.match(route,/You're on the Servonas early-access list/);
 assert.match(route,/if\(!existing\?\.id\)await sendEarlyAccessEmails/);
});

test("email failures are contained after persistence and do not expose secrets",async()=>{
 const route=await read("app/api/early-access/route.ts");
 assert.match(route,/catch\{console\.error\("Early access email request failed",\{kind\}\);\}/);
 assert.match(route,/missing:\[!apiKey\?"RESEND_API_KEY"/);
 assert.doesNotMatch(route,/console\.error\([^\n]*\{[^}]*apiKey\s*[,}]/);
});
