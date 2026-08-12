import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const source=()=>readFile(new URL("../app/app/[businessSlug]/assistant/AssistantClient.tsx",import.meta.url),"utf8");

test("Enter submissions restore focus after the Assistant request settles",async()=>{const code=await source();assert.match(code,/composerInput=useRef<HTMLTextAreaElement>\(null\)/);assert.match(code,/restoreComposerFocus\.current=true;event\.currentTarget\.form\?\.requestSubmit\(\)/);assert.match(code,/await submitAssistant\(value,typedRequest\.channel,typedRequest\.requestId\);if\(shouldRestoreFocus\)requestAnimationFrame\(\(\)=>composerInput\.current\?\.focus\(\)\)/);assert.match(code,/<textarea ref=\{composerInput\}/);});
test("clicking Send does not forcibly steal focus",async()=>{const code=await source();assert.match(code,/const shouldRestoreFocus=restoreComposerFocus\.current;restoreComposerFocus\.current=false/);assert.doesNotMatch(code,/<button[^>]+onClick=.*focus/);});
test("Shift Enter remains available for a newline",async()=>{const code=await source();assert.match(code,/event\.key==="Enter"&&!event\.shiftKey/);});
