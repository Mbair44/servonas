import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("meta pixel migration adds tenant-scoped configuration to website settings",async()=>{
 const sql=await read("supabase/migrations/20260828000100_business_website_meta_pixel.sql");
 assert.match(sql,/alter table public\.business_website_settings/);
 assert.match(sql,/add column if not exists meta_pixel_id text/);
 assert.match(sql,/business_website_settings_meta_pixel_id_check/);
 assert.match(sql,/\^\[0-9\]\{8,24\}\$/);
});

test("website settings save flow validates and persists the Meta Pixel ID",async()=>{
 const [actions,page]=await Promise.all([
  read("app/app/[businessSlug]/settings/website/actions.ts"),
  read("app/app/[businessSlug]/settings/website/page.tsx"),
 ]);
 assert.match(actions,/const normalizeMetaPixelId=/);
 assert.match(actions,/Use a valid numeric Meta Pixel ID/);
 assert.match(actions,/meta_pixel_id:metaPixelId/);
 assert.match(page,/name="metaPixelId"/);
 assert.match(page,/Meta Pixel ID/);
 assert.match(page,/Connect Meta Ads to your website so Meta can measure website visits and conversions\./);
 assert.match(page,/2375527282981645/);
});

test("public website loader and shell keep Meta Pixel tenant scoped and preview-safe",async()=>{
 const [loader,site,component]=await Promise.all([
  read("lib/businessWebsite.ts"),
  read("components/BusinessWebsite.tsx"),
  read("components/TenantMetaPixel.tsx"),
 ]);
 assert.match(loader,/const sanitizeMetaPixelId=/);
 assert.match(loader,/meta_pixel_id/);
 assert.match(loader,/metaPixelId:sanitizeMetaPixelId\(settings\.meta_pixel_id\)/);
 assert.match(site,/!preview&&site\.metaPixelId&&<TenantMetaPixel pixelId=\{site\.metaPixelId\}\/>/);
 assert.match(component,/servonas\.analytics_consent/);
 assert.match(component,/if\(!allowed\|\|!normalizedPixelId\)return null;/);
 assert.match(component,/fbq\("init",normalizedPixelId\)/);
 assert.match(component,/fbq\("track","PageView"\)/);
 assert.match(component,/__servonasMetaPixelPageViews/);
});

test("tenant meta pixel only uses Servonas-owned Meta code and ignores invalid ids",async()=>{
 const component=await read("components/TenantMetaPixel.tsx");
 assert.match(component,/PIXEL_ID_PATTERN=\/\^\[0-9\]\{8,24\}\$\//);
 assert.match(component,/connect\.facebook\.net\/en_US\/fbevents\.js/);
 assert.match(component,/www\.facebook\.com\/tr\?id=\$\{normalizedPixelId\}&ev=PageView&noscript=1/);
 assert.doesNotMatch(component,/dangerouslySetInnerHTML/);
});
