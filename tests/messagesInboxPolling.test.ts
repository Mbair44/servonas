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

test("opening a conversation positions its thread at the newest message",async()=>{
 const inbox=await readFile("app/app/[businessSlug]/customers/messages/MessagesInbox.tsx","utf8");
 assert.match(inbox,/messageList=useRef<HTMLDivElement>\(null\)/);
 assert.match(inbox,/list\.scrollTop=list\.scrollHeight/);
 assert.match(inbox,/setThreadFocusVersion\(version=>version\+1\)/);
 assert.match(inbox,/<div ref=\{messageList\} className=\{styles\.messages\}/);
});

test("message threads link known customers and support keyboard sending",async()=>{
 const [inbox,page]=await Promise.all([
  readFile("app/app/[businessSlug]/customers/messages/MessagesInbox.tsx","utf8"),
  readFile("app/app/[businessSlug]/customers/messages/page.tsx","utf8"),
 ]);
 assert.match(inbox,/href=\{`\/app\/\$\{encodeURIComponent\(slug\)\}\/customers\/\$\{encodeURIComponent\(customerId\)\}`\}/);
 assert.match(inbox,/event\.key!=="Enter"\|\|event\.shiftKey\|\|event\.nativeEvent\.isComposing/);
 assert.match(inbox,/composer\.current\?\.requestSubmit\(\)/);
 assert.match(inbox,/Emoji keyboard supported/);
 assert.match(page,/epic3-header epic3-header-compact/);
});

test("conversation sidebar fills the inbox panel and scrolls independently",async()=>{
 const css=await readFile("app/app/[businessSlug]/customers/messages/messages.module.css","utf8");
 assert.match(css,/\.list\{align-self:stretch;height:100%;max-height:none;/);
});
