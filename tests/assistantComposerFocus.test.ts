import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const source=()=>readFile(new URL("../app/app/[businessSlug]/assistant/AssistantClient.tsx",import.meta.url),"utf8");

test("Enter submissions restore focus after the enabled Assistant composer renders",async()=>{const code=await source();assert.match(code,/composerInput=useRef<HTMLTextAreaElement>\(null\)/);assert.match(code,/restoreComposerFocus\.current=true;event\.currentTarget\.form\?\.requestSubmit\(\)/);assert.match(code,/useEffect\(\(\)=>\{if\(!busy&&restoreComposerFocus\.current\)\{restoreComposerFocus\.current=false;requestAnimationFrame\(\(\)=>composerInput\.current\?\.focus\(\)\);\}\},\[busy\]\)/);assert.match(code,/<textarea ref=\{composerInput\}/);});
test("clicking Send does not forcibly steal focus",async()=>{const code=await source(),sendBody=code.slice(code.indexOf("async function send"),code.indexOf("async function transcribe"));assert.doesNotMatch(code,/<button[^>]+onClick=.*focus/);assert.doesNotMatch(sendBody,/restoreComposerFocus\.current=true/);});
test("Shift Enter remains available for a newline",async()=>{const code=await source();assert.match(code,/event\.key==="Enter"&&!event\.shiftKey/);});
