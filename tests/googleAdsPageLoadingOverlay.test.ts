import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("google ads page mounts a shared loading overlay for page actions", async () => {
 const [page, overlay, styles] = await Promise.all([
  read("app/app/[businessSlug]/marketing/google-ads/page.tsx"),
  read("components/GoogleAdsPageLoadingOverlay.tsx"),
  read("app/globals.css"),
 ]);
 assert.match(page, /import \{ GoogleAdsPageLoadingOverlay \} from "@\/components\/GoogleAdsPageLoadingOverlay";/);
 assert.match(page, /<GoogleAdsPageLoadingOverlay \/>/);
 assert.match(overlay, /document\.addEventListener\("submit", onSubmit, true\);/);
 assert.match(overlay, /document\.addEventListener\("click", onClick, true\);/);
 assert.match(overlay, /const label = submitter\?\.getAttribute\("data-loading-label"\)\?\.trim\(\)/);
 assert.match(overlay, /const label = anchor\.getAttribute\("data-loading-label"\)\?\.trim\(\)/);
 assert.match(styles, /\.google-ads-page-overlay\{/);
 assert.match(styles, /@keyframes google-ads-page-overlay-spin/);
});
