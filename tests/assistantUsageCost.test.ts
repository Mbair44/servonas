import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(path,import.meta.url),"utf8");

test("OpenAI provider captures provider-returned token usage",async()=>{const source=await read("../lib/assistant/provider.ts");assert.match(source,/prompt_tokens/);assert.match(source,/completion_tokens/);assert.match(source,/cached_tokens/);assert.match(source,/providerRequestId|requestId/);});
test("AI cost uses immutable model-rate snapshots",async()=>{const migration=await read("../supabase/migrations/20260810000800_ai_usage_cost_foundation.sql"),usage=await read("../lib/assistant/usage.ts");assert.match(migration,/create table public\.ai_model_pricing/);assert.match(migration,/create table public\.ai_provider_usage/);assert.match(migration,/pricing_snapshot jsonb/);assert.match(usage,/pricing_snapshot/);assert.match(usage,/1_000_000/);});
test("duplicate provider requests cannot be counted twice",async()=>{const migration=await read("../supabase/migrations/20260810000800_ai_usage_cost_foundation.sql"),usage=await read("../lib/assistant/usage.ts");assert.match(migration,/unique index ai_provider_usage_provider_request/);assert.match(usage,/error\.code!=="23505"/);});
test("unknown models remain visibly unpriced",async()=>{const migration=await read("../supabase/migrations/20260810000800_ai_usage_cost_foundation.sql"),page=await read("../app/app/admin/usage/page.tsx");assert.match(migration,/pricing_status text not null check\(pricing_status in\('priced','unpriced'\)\)/);assert.match(page,/Unpriced AI requests/);});
test("usage dashboard is restricted to platform admins",async()=>{const page=await read("../app/app/admin/usage/page.tsx");assert.match(page,/isServonasPlatformAdmin/);assert.match(page,/redirect\("\/app"\)/);});
