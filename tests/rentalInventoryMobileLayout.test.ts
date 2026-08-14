import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("rental inventory uses an inline, single-column mobile setup flow", async () => {
  const css = await readFile("app/globals.css", "utf8");

  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.rental-create>form\{position:static/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.rental-inventory-form-grid\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.rental-admin-grid\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.rental-inventory-form-grid input\[type=file\]::file-selector-button/);
  assert.match(css, /\.rental-form-actions\{align-items:stretch;flex-direction:column/);
});
