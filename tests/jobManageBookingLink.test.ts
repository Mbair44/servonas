import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("job page opens a validated existing Manage Booking URL without generating a token",async()=>{
 const page=await readFile(new URL("../app/app/[businessSlug]/jobs/[jobId]/page.tsx",import.meta.url),"utf8");
 assert.match(page,/existingManageBookingUrl/);
 assert.match(page,/messageBodies:\(smsEvents\?\?\[\]\)\.map\(event=>event\.message_body\)/);
 assert.match(page,/target="_blank"/);
 assert.match(page,/>Manage booking</);
 assert.doesNotMatch(page,/createBookingManageToken/);
});
