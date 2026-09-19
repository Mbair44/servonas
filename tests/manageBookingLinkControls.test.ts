import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("manage booking link controls retain a newly generated URL only in page memory", () => {
  const source = readFileSync(new URL("../components/ManageBookingLinkControls.tsx", import.meta.url), "utf8");
  assert.match(source, /useState<string \| null>\(null\)/);
  assert.match(source, /if \(currentUrl\)/);
  assert.match(source, /previous link is disabled/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
