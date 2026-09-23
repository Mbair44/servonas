import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
test("Search Console reporting reuses normalized URLs before location-page matching",async()=>{
  const [page,client]=await Promise.all([
    readFile(new URL("../app/app/[businessSlug]/marketing/seo/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../lib/googleSearchConsole.ts",import.meta.url),"utf8"),
  ]);
  assert.match(page,/normalizeSearchConsoleUrl\(String\(row\.page_url\)\)/);
  assert.match(client,/propertyMatchesDomain/);
});

test("Local SEO presents cached Google data in owner-friendly language",async()=>{
  const page=await readFile(new URL("../app/app/[businessSlug]/marketing/seo/page.tsx",import.meta.url),"utf8");
  assert.match(page,/Times you appeared on Google/);
  assert.match(page,/Visits from Google/);
  assert.match(page,/What people are searching for/);
  assert.match(page,/What should I do next\?/);
  assert.match(page,/Google is connected/);
});
