import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("first-time google ads onboarding shows one guided starting point and softer budget copy", async () => {
 const page = await read("app/app/[businessSlug]/marketing/google-ads/page.tsx");
 assert.match(page, /Get started with Google Ads/);
 assert.match(page, /Do you already have a Google Ads account\?/);
 assert.match(page, /Yes, connect my account/);
 assert.match(page, /No, help me create one/);
 assert.match(page, /Servonas will guide you through setup step by step\. You stay in control of your budget, and Google bills you directly\./);
 assert.match(page, /You choose the amount/);
 assert.match(page, /Start small and adjust anytime\. Google bills you directly\./);
 assert.doesNotMatch(page, /\$500\.00\"}\/month/);
});

test("google ads onboarding uses popup oauth with safe fallback and same-origin completion", async () => {
 const [launcher, connectRoute, callbackRoute] = await Promise.all([
  read("components/GoogleAdsOauthLauncher.tsx"),
  read("app/api/google-ads/connect/[businessSlug]/route.ts"),
  read("app/api/google-ads/callback/route.ts"),
 ]);
 assert.match(launcher, /window\.open\(popupHref, "servonas-google-ads-oauth", popupFeatures\(\)\)/);
 assert.match(launcher, /if \(isProbablyMobile\(\)\) \{/);
 assert.match(launcher, /window\.location\.assign\(connectHref\);/);
 assert.match(launcher, /Your browser blocked the Google sign-in popup/);
 assert.match(launcher, /window\.location\.assign\(typeof event\.data\.redirectUrl === "string" \? event\.data\.redirectUrl :/);
 assert.match(callbackRoute, /type:"servonas:google-ads-oauth-complete"/);
 assert.match(callbackRoute, /window\.opener\.postMessage\(payload,window\.location\.origin\)/);
 assert.match(callbackRoute, /window\.close\(\)/);
 assert.match(connectRoute, /const popup = new URL\(request\.url\)\.searchParams\.get\("popup"\) === "1"/);
 assert.match(connectRoute, /createGoogleAdsOauthState\(businessSlug, business\.id, user\.id, popup\)/);
});

test("google ads onboarding keeps roadmap, progress, readiness checks, and hides internal identity from tenant-facing summary", async () => {
 const [page, styles] = await Promise.all([
  read("app/app/[businessSlug]/marketing/google-ads/page.tsx"),
  read("app/globals.css"),
 ]);
 assert.match(page, /Setup progress: \{setupProgressCount\} of \{setupSteps\.length\} complete/);
 assert.match(page, /Servonas already has these covered/);
 assert.match(page, /Business info/);
 assert.match(page, /Landing page/);
 assert.match(page, /Connect your Google account/);
 assert.match(page, /Choose your Google Ads account/);
 assert.match(page, /Confirm billing with Google/);
 assert.match(page, /Review before it goes live/);
 assert.match(page, /role === "platform_admin" && <span>\{connection\?\.google_authenticated_email/);
 assert.match(styles, /\.google-ads-onboarding-choice\{/);
 assert.match(styles, /\.google-ads-guide-progress/);
 assert.match(styles, /\.google-ads-readiness-group/);
});
