import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

test("opening Assistant positions its message viewport at the latest message",async()=>{
 const client=await readFile(new URL("../app/app/[businessSlug]/assistant/AssistantClient.tsx",import.meta.url),"utf8");
 assert.match(client,/useLayoutEffect/);
 assert.match(client,/messageList=useRef<HTMLDivElement>\(null\)/);
 assert.match(client,/useLayoutEffect\(\(\)=>\{const list=messageList\.current;if\(list\)list\.scrollTop=list\.scrollHeight;\},\[\]\)/);
 assert.match(client,/<div ref=\{messageList\} className="assistant-messages"/);
 assert.match(client,/scrollIntoView\(\{behavior:"smooth"\}\)/,"new-message smooth scrolling remains available");
});
