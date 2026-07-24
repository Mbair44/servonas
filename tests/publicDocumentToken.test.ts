import test from "node:test";
import assert from "node:assert/strict";
import { generatePublicDocumentToken, publicDocumentTokenHash, validPublicDocumentToken } from "../lib/publicDocumentToken.ts";

test("public document tokens provide 256 bits of URL-safe entropy", () => {
  const token=generatePublicDocumentToken();
  assert.equal(token.length,43);
  assert.equal(validPublicDocumentToken(token),true);
  assert.match(token,/^[A-Za-z0-9_-]+$/);
});
test("public document token hashes are deterministic SHA-256 bytea values",async()=>{
  const token=generatePublicDocumentToken();
  const first=await publicDocumentTokenHash(token);
  assert.equal(first,await publicDocumentTokenHash(token));
  assert.match(first,/^\\x[0-9a-f]{64}$/);
  assert.equal(first.includes(token),false);
});
test("malformed public document tokens are rejected",async()=>{
  assert.equal(validPublicDocumentToken("short"),false);
  await assert.rejects(()=>publicDocumentTokenHash("short"),/Invalid/);
});
