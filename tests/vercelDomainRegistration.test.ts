import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {DOMAIN_RETAIL_MARKUP_BPS,VercelDomainApiError,domainRetailPrice,vercelDomainErrorDetails} from "../lib/vercelDomains.ts";

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

test("customer-facing domain prices include the configured seventy-five-percent margin",async()=>{
 assert.equal(DOMAIN_RETAIL_MARKUP_BPS,7500);
 assert.equal(domainRetailPrice(10),17.5);
 assert.equal(domainRetailPrice(12.34),21.6);
 assert.equal(domainRetailPrice(0),0);
 assert.throws(()=>domainRetailPrice(-1));
 const route=await read("app/api/domains/availability/route.ts");
 assert.match(route,/purchasePrice:domainRetailPrice\(quote\.purchasePrice\)/);
 assert.match(route,/renewalPrice:domainRetailPrice\(quote\.renewalPrice\)/);
});

test("provider cost and customer retail domain prices are stored separately",async()=>{
 const [migration,markupMigration,actions]=await Promise.all([read("supabase/migrations/20260814000200_domain_retail_pricing.sql"),read("supabase/migrations/20260817000200_domain_retail_markup_75_percent.sql"),read("app/app/admin/domains/actions.ts")]);
 assert.match(migration,/customer_purchase_price numeric\(12,2\)/);
 assert.match(migration,/customer_renewal_price numeric\(12,2\)/);
 assert.match(migration,/retail_markup_bps integer not null default 1500/);
 assert.match(markupMigration,/default 7500/);
 assert.match(actions,/retail_markup_bps:7500/);
 assert.match(actions,/purchase_price:quote\.purchasePrice/);
 assert.match(actions,/customer_purchase_price:domainRetailPrice\(quote\.purchasePrice\)/);
 assert.match(actions,/buyVercelDomain\(domain,quote\.purchasePrice,registrant\)/);
});

test("registrar failures become actionable without exposing provider response bodies",()=>{
 assert.deepEqual(vercelDomainErrorDetails(new VercelDomainApiError(400,"price_mismatch","provider detail")),{category:"vercel_price_mismatch",message:"Vercel reports that the domain price changed. Check availability and price again before purchasing.",uncertain:false});
 assert.equal(vercelDomainErrorDetails(new VercelDomainApiError(403,"forbidden","provider detail")).message,"The Vercel token is not authorized to purchase this domain for the configured account or team.");
 assert.equal(vercelDomainErrorDetails(new TypeError("network detail")).uncertain,true);
});

test("uncertain registrar outcomes keep the purchase lock instead of enabling a duplicate purchase",async()=>{
 const actions=await read("app/app/admin/domains/actions.ts");
 assert.match(actions,/details\.uncertain\?"registration_pending":"failed"/);
 assert.match(actions,/has a protected registration attempt/);
 assert.match(actions,/check the Vercel Domains dashboard before trying again/i);
 assert.match(actions,/No automatic retry was made/);
});
