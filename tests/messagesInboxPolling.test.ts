import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

test("message inbox polls every 30 seconds only while the tab is visible",async()=>{
 const [inbox,page]=await Promise.all([
  readFile("app/app/[businessSlug]/customers/messages/MessagesInbox.tsx","utf8"),
  readFile("app/app/[businessSlug]/customers/messages/page.tsx","utf8"),
 ]);
 assert.match(inbox,/const pollingIntervalMs=30_000/);
 assert.match(inbox,/const tabIsVisible=\(\)=>document\.visibilityState==="visible"/);
 assert.match(inbox,/running\|\|stopped\|\|!tabIsVisible\(\)/);
 assert.match(inbox,/running\|\|lock\.current\|\|!tabIsVisible\(\)/);
 assert.match(inbox,/document\.addEventListener\("visibilitychange",onVisibilityChange\)/);
 assert.match(inbox,/setInterval\(\(\)=>void refresh\(\),pollingIntervalMs\)/);
 assert.match(page,/Updates every 30 seconds while this tab is visible/);
});
