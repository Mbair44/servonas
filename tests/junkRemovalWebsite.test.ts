import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { INDUSTRY_PROFILES, suggestedProfileDefaults } from "../lib/onboardingProfile.ts";
import { getWebsiteFirstConfig, isWebsiteFirstSource } from "../lib/websiteFirstConfig.ts";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("junk removal is registered as a first-class Servonas industry", () => {
  assert.equal(INDUSTRY_PROFILES.includes("junk_removal"), true);
  assert.deepEqual(suggestedProfileDefaults("junk_removal"), {
    serviceName: "Junk removal quote",
    durationMinutes: 90,
    recurringAllowed: false,
  });
});

test("junk removal website-first source has industry defaults", () => {
  assert.equal(isWebsiteFirstSource("junk-removal-website"), true);
  const config = getWebsiteFirstConfig("junk-removal-website");
  assert.equal(config?.industryLabel, "junk removal");
  assert.match(config?.defaultHero ?? "", /Got Junk/);
  assert.equal(config?.services.includes("Furniture Removal"), true);
  assert.equal(config?.services.includes("Construction Debris Removal"), true);
});

test("junk removal public routes are wired into the existing landing and demo architecture", async () => {
  const [landing, demo] = await Promise.all([
    read("app/junk-removal-website/page.tsx"),
    read("app/demo/junk-removal/page.tsx"),
  ]);
  assert.match(landing, /WebsiteIndustryLanding/);
  assert.match(landing, /source:\s*"junk-removal-website"/);
  assert.match(landing, /junk removal quote requests/i);
  assert.match(landing, /junk-removal-team-loading-truck\.png/);
  assert.match(demo, /WebsiteIndustryDemo/);
  assert.match(demo, /businessName:\s*"Junk Devils"/);
  assert.match(demo, /industryProfile:\s*"junk_removal"/);
  assert.match(demo, /junk-removal-team-loading-truck\.png/);
  assert.match(demo, /junk-removal-garage-cleanout\.png/);
});

test("shared business website renders junk-removal-specific quote-first sections", async () => {
  const code = await read("components/BusinessWebsite.tsx");
  assert.match(code, /isJunk/);
  assert.match(code, /Get a Free Quote/);
  assert.match(code, /What we take/);
  assert.match(code, /What we don’t take/);
  assert.match(code, /Neighbors love having their space back/);
  assert.match(code, /business-site-sticky-cta/);
  assert.match(code, /variant=\{isJunk\?"quote":isChristmasLights\?"christmas":"service"\}/);
});

test("database migrations accept junk_removal and junk-removal-website", async () => {
  const migration = await read("supabase/migrations/20260827000200_add_junk_removal_website_industry.sql");
  assert.match(migration, /junk_removal/);
  assert.match(migration, /junk-removal-website/);
  assert.match(migration, /Junk removal quote/);
  assert.match(migration, /Got Junk\? We’ll Make It Disappear\./);
});
