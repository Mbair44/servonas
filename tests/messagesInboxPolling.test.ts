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
 assert.match(page,/epic3-header epic3-header-compact \$\{styles\.pageHeader\}/);
});

test("conversation sidebar fills a bounded inbox panel and scrolls independently",async()=>{
 const css=await readFile("app/app/[businessSlug]/customers/messages/messages.module.css","utf8");
 assert.match(css,/\.layout\{[^}]*height:75vh;min-height:520px/);
 assert.match(css,/\.list\{align-self:stretch;height:100%;min-height:0;max-height:none;[^}]*overflow:auto/);
});

test("messaging header and composer use compact horizontal space",async()=>{
 const [page,css]=await Promise.all([
  readFile("app/app/[businessSlug]/customers/messages/page.tsx","utf8"),
  readFile("app/app/[businessSlug]/customers/messages/messages.module.css","utf8"),
 ]);
 assert.match(page,/<h1>Message inbox<\/h1><p>Customer texts and replies/);
 assert.doesNotMatch(page,/<small>Messages<\/small>/);
 assert.match(css,/\.pageHeader\{align-items:center;margin-bottom:12px/);
 assert.match(css,/\.composer>button\{grid-column:2;grid-row:3;align-self:center/);
});
