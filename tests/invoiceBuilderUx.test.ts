import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("invoice builder renders an empty line-item state and a single add item action", async () => {
  const source = await read("components/EstimateForm.tsx");
  assert.match(source, /No line items yet\./);
  assert.match(source, /\+ Add item/);
  assert.doesNotMatch(source, /\+ Add Another item/);
});

test("new invoice line items open one editor at a time with immediate item focus", async () => {
  const source = await read("components/EstimateForm.tsx");
  assert.match(source, /const \[expandedLineIndex, setExpandedLineIndex\] = useState<number \| null>\(null\)/);
  assert.match(source, /itemInputRefs/);
  assert.match(source, /requestAnimationFrame\(\(\) => itemInputRefs\.current\[index\]\?\.focus\(\)\)/);
  assert.match(source, /const isExpanded = !isInvoice \|\| expandedLineIndex === index;/);
});

test("invoice item entry uses a unified searchable item field instead of a permanent price book selector", async () => {
  const source = await read("components/EstimateForm.tsx");
  assert.match(source, /list=\{`price-book-items-\$\{index\}`\}/);
  assert.match(source, /<datalist id=\{`price-book-items-\$\{index\}`\}>/);
  assert.match(source, /syncLineWithItemInput/);
  assert.doesNotMatch(source, />\s*Price book\s*</);
});

test("expanded invoice items show only the primary fields by default and tuck extras behind links", async () => {
  const source = await read("components/EstimateForm.tsx");
  assert.match(source, /<span>Amount<\/span>/);
  assert.match(source, /Add description/);
  assert.match(source, /More options/);
  assert.match(source, /Discount/);
  assert.match(source, /Taxable/);
  assert.doesNotMatch(source, /Discount type/);
});

test("invoice line amount uses the pre-tax subtotal while the summary owns tax presentation", async () => {
  const source = await read("components/EstimateForm.tsx");
  assert.match(source, /formatCents\(isInvoice \? totals\.lines\[index\]\.lineSubtotalCents : totals\.lines\[index\]\.lineTotalCents\)/);
  assert.match(source, /<dt>Tax<\/dt>/);
  assert.doesNotMatch(source, /<dt>Taxable subtotal<\/dt>/);
});

test("done validates and add item validates before opening the next blank line", async () => {
  const source = await read("components/EstimateForm.tsx");
  assert.match(source, /const validateLine = \(line: EstimateLineDraft\)/);
  assert.match(source, /Item is required\./);
  assert.match(source, /Quantity must be greater than zero\./);
  assert.match(source, /Rate must be valid\./);
  assert.match(source, /if \(expandedLineIndex !== null && !completeLineEditing\(expandedLineIndex\)\) return;/);
  assert.match(source, />\s*Done\s*</);
});

test("collapsed invoice rows stay compact and show summary values plus subtle badges", async () => {
  const source = await read("components/EstimateForm.tsx");
  assert.match(source, /Untitled item/);
  assert.match(source, /Optional short description/);
  assert.match(source, /estimate-line-badges/);
  assert.match(source, />\s*Edit\s*</);
});

test("invoice customer creation still uses the compact required-fields drawer", async () => {
  const source = await read("components/EstimateForm.tsx");
  assert.match(source, /Add only the required fields so this customer can be created from the invoice\./);
  assert.match(source, /title="Add new customer"/);
  assert.match(source, /name="manualCustomerFirstName"/);
  assert.match(source, /name="manualCustomerEmail"/);
  assert.match(source, /name="manualCustomerPhone"/);
});

test("invoice summary stays sticky and the new line-item layout has dedicated empty and amount styles", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /\.estimate-form\.estimate-builder\.invoice-builder \.estimate-builder-sidebar\{position:sticky;top:76px;align-self:start\}/);
  assert.match(css, /\.estimate-form\.estimate-builder\.invoice-builder \.estimate-line-empty\{/);
  assert.match(css, /\.estimate-form\.estimate-builder\.invoice-builder \.estimate-line-amount-panel\{/);
  assert.match(css, /@media\(max-width:900px\)\{\.estimate-form\.estimate-builder\.invoice-builder\{grid-template-columns:1fr\}\.estimate-form\.estimate-builder\.invoice-builder \.estimate-builder-sidebar\{position:static;top:auto\}/);
});
