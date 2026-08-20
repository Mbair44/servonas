import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(path,import.meta.url),"utf8");

test("website ai image migration adds generation ledger pricing and analytics tables",async()=>{
 const sql=await read("../supabase/migrations/20260820000100_website_ai_image_generation.sql");
 assert.match(sql,/create table public\.ai_image_model_pricing/);
 assert.match(sql,/create table public\.website_ai_image_generations/);
 assert.match(sql,/create table public\.website_ai_image_events/);
 assert.match(sql,/platform_business_ai_image_monthly_usage/);
 assert.match(sql,/unique\(business_id,idempotency_key\)/);
});

test("website actions protect generation with workspace auth limits pricing and lifecycle tracking",async()=>{
 const code=await read("../app/app/[businessSlug]/settings/website/actions.ts");
 assert.match(code,/requireWorkspaceCapability\(slug,"business_onboarding"\)/);
 assert.match(code,/canManageBusiness\(role\)/);
 assert.match(code,/websiteAiImageLimit\(entitlementSummary\)/);
 assert.match(code,/insert\(\{\s*business_id:business\.id[\s\S]*idempotency_key:input\.idempotencyKey/);
 assert.match(code,/https:\/\/api\.openai\.com\/v1\/images\/generations/);
 assert.match(code,/website_ai_image_generation_completed/);
 assert.match(code,/website_ai_image_generation_failed/);
 assert.match(code,/saveWebsiteAiPhoto/);
 assert.match(code,/discardWebsiteAiPhoto/);
});

test("photo manager exposes upload and ai creation side by side with generate save regenerate and discard controls",async()=>{
 const code=await read("../components/WebsitePhotoManager.tsx");
 assert.match(code,/Create with AI/);
 assert.match(code,/Create a photo for your website/);
 assert.match(code,/Generate Photo/);
 assert.match(code,/Use this photo/);
 assert.match(code,/Regenerate/);
 assert.match(code,/Discard/);
 assert.match(code,/crypto\.randomUUID\(\)/);
});
