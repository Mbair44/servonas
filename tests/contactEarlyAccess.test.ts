import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const page = readFileSync(path.join(root, "app/contact/page.tsx"), "utf8");
const action = readFileSync(path.join(root, "app/contact/actions.ts"), "utf8");

test("early-access contact page preserves the intent and describes the form", () => {
  assert.match(page, /query\.interest === "early-access"/);
  assert.match(page, /name="interest" value="early-access"/);
  assert.match(page, /Join Servonas early access/);
  assert.match(page, /your early-access interest was received/);
});

test("early-access contact submissions use the existing email delivery path", () => {
  assert.match(action, /process\.env\.RESEND_API_KEY/);
  assert.match(action, /process\.env\.EMAIL_FROM/);
  assert.match(action, /to: \[recipient\]/);
  assert.match(action, /text\(formData, "interest"\) === "early-access"/);
  assert.match(action, /Servonas early-access interest from/);
  assert.doesNotMatch(action, /supabase|signUp|tenant|customer/i);
});
