import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {normalizeGoogleSiteVerificationToken} from "../lib/website.ts";
import {tenantMetadata} from "../lib/publicTenantSeo.ts";

const token="vH0xdii8QxhpqHyczgxNFSNZxFujLVPVcTTflVJRBPA";

test("accepts a Google Search Console token but rejects HTML and unsafe values",()=>{
 assert.equal(normalizeGoogleSiteVerificationToken(token),token);
 assert.equal(normalizeGoogleSiteVerificationToken(`<meta name="google-site-verification" content="${token}">`),null);
 assert.equal(normalizeGoogleSiteVerificationToken("token with spaces"),null);
});

test("renders Google verification only for the configured tenant settings",()=>{
 const configured=tenantMetadata({settings:{google_site_verification_token:token},fallbackBase:"https://example.com",path:"/",title:"Example"});
 const unconfigured=tenantMetadata({settings:{},fallbackBase:"https://other.example",path:"/",title:"Other"});
 assert.deepEqual(configured.verification,{google:token});
 assert.equal(unconfigured.verification,undefined);
 assert.deepEqual(configured.keywords,[]);
});

test("public website code reads the tenant setting and no longer hard-codes a domain token",async()=>{
 const [domainPage,settingsPage,action,migration]=await Promise.all([
  readFile("app/sites/domain/[domain]/page.tsx","utf8"),
  readFile("app/app/[businessSlug]/settings/website/page.tsx","utf8"),
  readFile("app/app/[businessSlug]/settings/website/actions.ts","utf8"),
  readFile("supabase/migrations/20261113000100_google_site_verification.sql","utf8"),
 ]);
 assert.doesNotMatch(domainPage,/FNv8kUeUvE5WSUBFw4MCcDVkVCpN0H8zXITzmLMK1Vc/);
 assert.match(settingsPage,/<h2>Google Search Console Verification<\/h2>/);
 assert.equal((settingsPage.match(/name="googleSiteVerificationToken"/g)??[]).length,1);
 assert.match(action,/google_site_verification_token:googleSiteVerificationToken/);
 assert.match(action,/canManageBusiness\(role\)/);
 assert.match(migration,/google_site_verification_token/);
});
