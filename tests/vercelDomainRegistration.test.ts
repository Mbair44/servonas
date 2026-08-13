import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("Vercel registrar uses current availability price and purchase endpoints",async()=>{
 const source=await read("lib/vercelDomains.ts");
 assert.match(source,/\/v1\/registrar\/domains\/\$\{encoded\}\/availability/);
 assert.match(source,/\/v1\/registrar\/domains\/\$\{encoded\}\/price\?years=1/);
 assert.match(source,/\/v1\/registrar\/domains\/buy/);
 assert.match(source,/\/v1\/registrar\/orders\/\$\{encodeURIComponent\(orderId\)\}/);
 assert.match(source,/expectedPrice/);
 assert.match(source,/autoRenew:true/);
});

test("domain orders prevent duplicate provider purchases and store no credentials",async()=>{
 const [migration,actions]=await Promise.all([read("supabase/migrations/20260813000300_vercel_domain_registration.sql"),read("app/app/admin/domains/actions.ts")]);
 assert.match(migration,/unique\(business_id,domain_name\)/);
 assert.match(migration,/provider_order_id text unique/);
 assert.doesNotMatch(migration,/api_token|access_token|authorization/i);
 assert.match(actions,/\.eq\("status","available"\)\.is\("provider_order_id",null\)/);
 assert.match(actions,/REGISTER \$\{domain\}/);
 assert.match(actions,/isServonasPlatformAdmin/);
});

test("premium domains cannot consume the included standard-domain offer",async()=>{
 const [actions,registrar]=await Promise.all([read("app/app/admin/domains/actions.ts"),read("lib/vercelDomains.ts")]);
 assert.match(registrar,/VERCEL_STANDARD_DOMAIN_MAX_USD/);
 assert.match(actions,/vercelStandardDomainMaximumPrice/);
 assert.match(actions,/quote\.purchasePrice>standardLimit\(\)/);
 assert.match(actions,/premium domain costs/);
});

test("admin registrar UI separates quote from the final purchase",async()=>{
 const page=await read("app/app/admin/domains/page.tsx");
 assert.match(page,/Check availability &amp; price/);
 assert.match(page,/Register this domain through Vercel/);
 assert.match(page,/This purchase is final/);
 assert.match(page,/Phone \(E\.164\)/);
 assert.match(page,/Sync registration status/);
});
