import assert from "node:assert/strict";
import test from "node:test";
import {normalizeInstagramUrl} from "../lib/socialLinks.ts";

test("normalizes Instagram usernames and profile links",()=>{
 assert.equal(normalizeInstagramUrl("@copperstatebounce"),"https://www.instagram.com/copperstatebounce/");
 assert.equal(normalizeInstagramUrl("instagram.com/copper.state_bounce?utm_source=test"),"https://www.instagram.com/copper.state_bounce/");
});

test("rejects non-Instagram and non-profile links",()=>{
 assert.equal(normalizeInstagramUrl("https://example.com/copperstatebounce"),null);
 assert.equal(normalizeInstagramUrl("https://instagram.com/reel/abc"),null);
});
