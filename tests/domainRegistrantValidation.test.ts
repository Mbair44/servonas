import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("domain registration strips phone formatting and creates E.164 for US numbers",async()=>{const action=await read("app/app/admin/domains/actions.ts");assert.match(action,/rawPhone\.replace\(\/\\D\/g,""\)/);assert.match(action,/digits\.length===10\?`\+1\$\{digits\}`/);assert.match(action,/\^\\\+\[1-9\]\\d\{7,14\}\$/);});
test("domain registration verifies and normalizes registrant addresses with Google",async()=>{const action=await read("app/app/admin/domains/actions.ts");assert.match(action,/resolveGoogleAddress/);assert.match(action,/verified\.status!=="verified"/);assert.match(action,/Google could not verify the registrant address/);assert.match(action,/registrant\.zip=verified\.normalizedAddress\.postalCode/);});
