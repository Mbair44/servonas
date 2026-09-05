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
 assert.match(component,/ANALYTICS_CONSENT_KEY/);
 assert.match(component,/if\(!allowed\|\|!normalizedPixelId\)return null;/);
 assert.match(component,/ensureMetaPixelScript\(\)/);
 assert.match(component,/ensureMetaPixelStub\(\)/);
 assert.match(component,/fbq\("init",normalizedPixelId\)/);
 assert.match(component,/fbq\("track","PageView"\)/);
 assert.match(component,/__servonasMetaPixelPageViews/);
});

test("tenant meta pixel only uses Servonas-owned Meta code and ignores invalid ids",async()=>{
 const component=await read("components/TenantMetaPixel.tsx");
 assert.match(component,/PIXEL_ID_PATTERN=\/\^\[0-9\]\{8,24\}\$\//);
 assert.match(component,/connect\.facebook\.net\/en_US\/fbevents\.js/);
 assert.match(component,/document\.createElement\("script"\)/);
 assert.match(component,/document\.querySelector\(`script\[data-servonas-meta-pixel="\$\{META_PIXEL_SRC\}"\]`\)/);
 assert.match(component,/if\(typeof window\.fbq==="function"\)return window\.fbq;/);
 assert.match(component,/www\.facebook\.com\/tr\?id=\$\{normalizedPixelId\}&ev=PageView&noscript=1/);
 assert.doesNotMatch(component,/next\/script/);
});

test("custom-domain public route resolves into the shared business website shell with tenant pixel support",async()=>{
 const [domainRoute,site]=await Promise.all([
  read("app/sites/domain/[domain]/page.tsx"),
  read("components/BusinessWebsite.tsx"),
 ]);
 assert.match(domainRoute,/loadPublishedBusinessWebsiteByDomain/);
 assert.match(domainRoute,/return <BusinessWebsite site=\{site\}/);
 assert.match(site,/TenantMetaPixel/);
});

test("promotion and standalone booking routes mount only the resolved tenant pixel",async()=>{
 const [domainPromotion,hostedPromotion,booking,checkout,loader]=await Promise.all([
  read("app/sites/domain/[domain]/[promotionSlug]/page.tsx"),
  read("app/sites/[siteSlug]/[promotionSlug]/page.tsx"),
  read("app/book/[businessSlug]/page.tsx"),
  read("app/book/[businessSlug]/booking/page.tsx"),
  read("app/book/[businessSlug]/loadPublicBookingData.ts"),
 ]);
 assert.match(domainPromotion,/site\.metaPixelId&&<TenantMetaPixel pixelId=\{site\.metaPixelId\}\/>/);
 assert.match(hostedPromotion,/select\("business_id,meta_pixel_id"\)/);
 assert.match(hostedPromotion,/metaPixelId&&<TenantMetaPixel pixelId=\{metaPixelId\}\/>/);
 assert.match(loader,/from\("business_website_settings"\)\.select\("meta_pixel_id"\)/);
 for(const route of [booking,checkout])assert.match(route,/metaPixelId&&<TenantMetaPixel pixelId=\{metaPixelId\}\/>/);
 for(const route of [domainPromotion,hostedPromotion,booking,checkout])assert.doesNotMatch(route,/2375527282981645/);
});

test("tenant meta pixel can initialize immediately after consent without a hard refresh",async()=>{
 const [component,analytics,googleTag,helper]=await Promise.all([
  read("components/TenantMetaPixel.tsx"),
  read("components/MarketingAnalytics.tsx"),
  read("components/ConsentAwareGoogleTag.tsx"),
  read("lib/publicAnalytics.ts"),
 ]);
 assert.match(helper,/export const ANALYTICS_CONSENT_KEY="servonas\.analytics_consent"/);
 assert.match(helper,/isServonasAnalyticsHost/);
 assert.match(helper,/isPublicAnalyticsConsentPath/);
 assert.match(component,/const update=\(\)=>setAllowed\(localStorage\.getItem\(CONSENT_KEY\)==="granted"\)/);
 assert.match(component,/window\.addEventListener\("storage",update\)/);
 assert.match(component,/window\.setInterval\(update,250\)/);
 assert.match(component,/ensureMetaPixelScript\(\);\s+const fbq=ensureMetaPixelStub\(\);/s);
 assert.match(component,/if\(typeof fbq!=="function"\)return;/);
 assert.match(component,/fbq\("track","PageView"\)/);
 assert.match(analytics,/if\(!analyticsEnabled\|\|typeof window==="undefined"\|\|!consentSurface\(\)\|\|consent\)return null;/);
 assert.match(analytics,/const platform=\(\)=>isServonasAnalyticsHost\(location\.hostname\)/);
 assert.match(analytics,/const consentSurface=\(\)=>isPublicAnalyticsConsentPath\(location\.pathname\)/);
 assert.match(googleTag,/!isServonasAnalyticsHost\(location\.hostname\)\|\|!isPublicAnalyticsConsentPath\(location\.pathname\)/);
});
