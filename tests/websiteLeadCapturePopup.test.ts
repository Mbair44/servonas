import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("website lead capture popup migration adds tenant-scoped popup config and lead table",async()=>{
 const sql=await read("supabase/migrations/20260827000500_website_lead_capture_popup.sql");
 assert.match(sql,/alter table public\.business_website_settings/);
 assert.match(sql,/lead_capture_popup_enabled boolean not null default false/);
 assert.match(sql,/create table if not exists public\.website_discount_leads/);
 assert.match(sql,/unique\(business_id, normalized_email\)/);
 assert.match(sql,/source text not null default 'website_discount_popup'/);
});

test("public business website renders the lead capture popup from loaded website settings",async()=>{
 const [site,page,loader,actions]=await Promise.all([
  read("components/BusinessWebsite.tsx"),
  read("components/WebsiteLeadCapturePopup.tsx"),
  read("lib/businessWebsite.ts"),
  read("app/sites/[siteSlug]/actions.ts"),
 ]);
 assert.match(site,/WebsiteLeadCapturePopup/);
 assert.match(page,/localStorage/);
 assert.match(page,/marketingConsent/);
 assert.match(page,/utm_source/);
 assert.match(loader,/lead_capture_popup_enabled/);
 assert.match(actions,/website_discount_leads/);
 assert.match(actions,/lead_source:"Discount Popup"/);
});

test("customer directory exposes a website discount lead filter",async()=>{
 const page=await read("app/app/[businessSlug]/customers/page.tsx");
 assert.match(page,/name="lead"/);
 assert.match(page,/Website Discount Leads/);
 assert.match(page,/website-discount-lead/);
});
