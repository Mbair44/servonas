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
 assert.match(site,/site\.leadCapturePopup\.enabled/);
 assert.match(page,/localStorage/);
 assert.match(page,/marketingConsent/);
 assert.match(page,/utm_source/);
 assert.match(loader,/lead_capture_popup_enabled/);
 assert.match(actions,/website_discount_leads/);
 assert.match(actions,/lead_source:"Discount Popup"/);
});

test("website preview can render the lead capture popup without a live submit action",async()=>{
 const [site,popup,preview]=await Promise.all([
  read("components/BusinessWebsite.tsx"),
  read("components/WebsiteLeadCapturePopup.tsx"),
  read("app/app/[businessSlug]/settings/website/preview/page.tsx"),
 ]);
 assert.match(preview,/preview\/>/);
 assert.match(site,/preview=\{preview\}/);
 assert.match(popup,/This preview does not submit live popup leads/);
});

test("lead capture popup analytics include viewed and dismissed events",async()=>{
 const [popup,route,analytics]=await Promise.all([
  read("components/WebsiteLeadCapturePopup.tsx"),
  read("app/api/marketing/events/route.ts"),
  read("components/MarketingAnalytics.tsx"),
 ]);
 assert.match(popup,/lead_capture_popup_viewed/);
 assert.match(popup,/lead_capture_popup_dismissed/);
 assert.match(popup,/lead_capture_popup_submitted/);
 assert.match(popup,/lead_capture_popup_converted/);
 assert.match(route,/lead_capture_popup_dismissed/);
 assert.match(analytics,/trackMarketingEvent/);
});

test("lead capture popup does not expose the coupon code before email submission",async()=>{
 const popup=await read("components/WebsiteLeadCapturePopup.tsx");
 assert.match(popup,/website-lead-popup-offer"><strong>\{offer\}<\/strong><\/div>/);
 assert.doesNotMatch(popup,/website-lead-popup-offer\"><strong>\{offer\}<\/strong>\{popup\.couponCode/);
});

test("lead capture popup success state sends customers to their email instead of showing the coupon on screen",async()=>{
 const [popup,actions]=await Promise.all([
  read("components/WebsiteLeadCapturePopup.tsx"),
  read("app/sites/[siteSlug]/actions.ts"),
 ]);
 assert.match(popup,/Check your email for your discount and next steps\./);
 assert.doesNotMatch(popup,/Use code \$\{state\.couponCode\} at checkout\./);
 assert.doesNotMatch(popup,/Copy code/);
 assert.match(actions,/return popupState\(undefined,true,null,website\.lead_capture_popup_success_message\|\|"Check your email for your offer\."\);/);
});

test("customer directory exposes a website discount lead filter",async()=>{
 const page=await read("app/app/[businessSlug]/customers/page.tsx");
 assert.match(page,/name="lead"/);
 assert.match(page,/Website Discount Leads/);
 assert.match(page,/website-discount-lead/);
});
