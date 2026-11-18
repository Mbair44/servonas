import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261118000100_technician_job_mutation_idempotency.sql"), "utf8");
const actions = fs.readFileSync(path.join(root, "app/tech/actions.ts"), "utf8");
const detail = fs.readFileSync(path.join(root, "app/tech/jobs/[jobId]/page.tsx"), "utf8");
const route = fs.readFileSync(path.join(root, "app/tech/route/page.tsx"), "utf8");

test("technician lifecycle mutation contract is primary-only and assignment-scoped", () => {
  assert.match(migration, /create or replace function public\.is_active_primary_job_technician/i);
  assert.match(migration, /assignment_role='primary'/);
  assert.match(migration, /a\.is_active/);
  assert.match(migration, /t\.is_active and t\.is_technician and t\.can_be_assigned_jobs/);
  assert.match(migration, /not public\.is_active_primary_job_technician\(v_job\.business_id,v_job\.id\)/);
  assert.match(migration, /when 'dispatched' then p_status='en_route'/);
  assert.match(migration, /when 'in_progress' then p_status='completed'/);
  assert.doesNotMatch(migration, /when 'dispatched' then p_status='en_route'\s+or p_status='canceled'/);
});

test("note contract keeps active assigned helpers while lifecycle legacy wrapper is hardened", () => {
  assert.match(migration, /create or replace function public\.is_active_assigned_job_technician/i);
  assert.match(migration, /not public\.is_active_assigned_job_technician\(v_job\.business_id,v_job\.id\)/);
  assert.match(migration, /public\.transition_assigned_job_status_v2\(p_job_id,p_status,gen_random_uuid\(\)\)/);
  assert.match(migration, /public\.append_assigned_job_note_v2\(p_job_id,p_note,gen_random_uuid\(\)\)/);
});

test("ledger has actor and tenant scoped fingerprints, locks, and no direct authenticated grants", () => {
  assert.match(migration, /unique \(actor_user_id,business_id,job_id,operation,request_id\)/);
  assert.match(migration, /request_fingerprint text not null/);
  assert.match(migration, /for update;/);
  assert.match(migration, /Request ID was reused with different input/);
  assert.match(migration, /revoke all on public\.job_mutation_requests from anon,authenticated/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete|all) on public\.job_mutation_requests to authenticated/i);
});

test("web technician submissions call v2 with a stable form request id", () => {
  assert.match(actions, /transition_assigned_job_status_v2/);
  assert.match(actions, /append_assigned_job_note_v2/);
  assert.match(actions, /p_request_id: requestId/);
  assert.match(detail, /name="requestId" value=\{statusRequestId\}/);
  assert.match(detail, /name="requestId" value=\{noteRequestId\}/);
  assert.match(route, /name="requestId" value=\{randomUUID\(\)\}/);
});
