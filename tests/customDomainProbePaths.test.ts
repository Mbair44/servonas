import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { isBlockedCustomDomainProbePath } from "../lib/customDomainProbePaths.ts";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("blocks obvious WordPress probe paths", () => {
  assert.equal(isBlockedCustomDomainProbePath("/wp-admin/install.php"), true);
  assert.equal(isBlockedCustomDomainProbePath("/wp-login.php"), true);
  assert.equal(isBlockedCustomDomainProbePath("/xmlrpc.php"), true);
  assert.equal(isBlockedCustomDomainProbePath("/wp-content/plugins/example.php"), true);
});

test("allows legitimate customer routes and nested paths", () => {
  assert.equal(isBlockedCustomDomainProbePath("/mechanical-bull-rental"), false);
  assert.equal(isBlockedCustomDomainProbePath("/services/mechanical-bull-rental"), false);
  assert.equal(isBlockedCustomDomainProbePath("/blog/my-wp-admin-story"), false);
});

test("middleware blocks probe paths before custom-domain rewrite and preserves normal routing", async () => {
  const middleware = await read("middleware.ts");
  assert.match(middleware, /isBlockedCustomDomainProbePath\(path\)/);
  assert.match(middleware, /return new NextResponse\(null,\{status:404\}\)/);
  assert.match(middleware, /path==="\/mechanical-bull-rental"/);
  assert.match(middleware, /path==="\/booking"/);
  assert.match(middleware, /path==="\/booking\/checkout"/);
  assert.match(middleware, /`\/sites\/domain\/\$\{encodeURIComponent\(hostname\)\}`/);
});
