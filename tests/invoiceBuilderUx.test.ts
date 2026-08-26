import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("invoice builder keeps one add item action and expands the new row immediately", async () => {
  const source = await read("components/EstimateForm.tsx");
  assert.match(source, /setExpandedLineIndex\(lines\.length\);/);
  assert.match(source, /\+ Add item/);
  assert.doesNotMatch(source, /\+ Add another item/);
});

test("invoice rows are compact by default and only expand while editing", async () => {
  const source = await read("components/EstimateForm.tsx");
  assert.match(source, /const \[expandedLineIndex, setExpandedLineIndex\] = useState<number \| null>/);
  assert.match(source, /const isExpanded = !isInvoice \|\| expandedLineIndex === index;/);
  assert.match(source, /className=\{`estimate-line-card\$\{isExpanded \? " expanded" : " collapsed"\}\$\{isInvoice \? " invoice-line-card" : ""\}`\}/);
  assert.match(source, /Edit item details/);
});

test("invoice line amount uses the pre-tax subtotal while the summary owns tax presentation", async () => {
  const source = await read("components/EstimateForm.tsx");
  assert.match(source, /formatCents\(isInvoice \? totals\.lines\[index\]\.lineSubtotalCents : totals\.lines\[index\]\.lineTotalCents\)/);
  assert.match(source, /<dt>Tax<\/dt>/);
  assert.doesNotMatch(source, /<dt>Taxable subtotal<\/dt>/);
});

test("invoice summary stays sticky below the authenticated header and can scroll internally", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.estimate-form\.estimate-builder\.invoice-builder \.estimate-builder-sidebar\{position:sticky;top:76px;align-self:start\}/);
  assert.match(css, /\.estimate-form\.estimate-builder\.invoice-builder \.estimate-summary-card\{gap:14px;max-height:calc\(100vh - 100px\);overflow:auto\}/);
  assert.match(css, /@media\(max-width:900px\)\{\.estimate-form\.estimate-builder\.invoice-builder\{grid-template-columns:1fr\}\.estimate-form\.estimate-builder\.invoice-builder \.estimate-builder-sidebar\{position:static;top:auto\}/);
});

test("invoice polish removes heavy helper copy while keeping concise note visibility text", async () => {
  const source = await read("components/EstimateForm.tsx");
  assert.doesNotMatch(source, /Pick the customer first, then confirm the location, timing, and related work\./);
  assert.doesNotMatch(source, /This is the center of the invoice\. Add each charge and the summary updates immediately\./);
  assert.doesNotMatch(source, /Only reveal discounts, fees, and deposits when this invoice actually needs them\./);
  assert.doesNotMatch(source, /Keep the page compact until you actually need extra context for the customer or your team\./);
  assert.match(source, /Visible to the customer\./);
  assert.match(source, /Only visible to your team\./);
});
