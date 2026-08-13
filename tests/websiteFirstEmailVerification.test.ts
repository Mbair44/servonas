import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("unconfirmed website-first signup carries its destination to the confirmation screen",async()=>{const actions=await read("app/auth/actions.ts");assert.match(actions,/auth\/confirm\?email=.*&next=/);assert.match(actions,/&source=\$\{source\}/);assert.match(actions,/emailRedirectTo: `\$\{origin\}\/auth\/callback\?next=/);});
test("resending verification preserves website-first source and callback destination",async()=>{const [actions,confirm]=await Promise.all([read("app/auth/actions.ts"),read("app/auth/confirm/page.tsx")]);assert.match(actions,/requestedNext=value\(formData,"next"\)/);assert.match(actions,/source\?`\/onboarding\?source=\$\{source\}`/);assert.match(confirm,/name="next"/);assert.match(confirm,/name="source"/);});
test("verification callback recovers website-first onboarding from trusted auth metadata",async()=>{const callback=await read("app/auth/callback/route.ts");assert.match(callback,/getWebsiteFirstConfig\(user\?\.user_metadata\?\.acquisition_source\)/);assert.match(callback,/`\/onboarding\?source=\$\{source\.source\}`/);assert.match(callback,/!requestedNext\.startsWith\("\/\/"\)/);});
test("normal verification destinations remain unchanged when no campaign source exists",async()=>{const actions=await read("app/auth/actions.ts");assert.match(actions,/source\?`\/onboarding\?source=\$\{source\}`:"\/onboarding"/);});
