import assert from "node:assert/strict";
import test from "node:test";
import { canReadTenantRoute, hasRouteCapability, type RouteCapability } from "../lib/routing/permissions.ts";

test("office roles receive operational routing capabilities", () => {
  const capabilities: RouteCapability[] = ["view_all_routes","view_route_map","recalculate_routes","reorder_stops","reassign_jobs","run_optimization","apply_optimization","view_route_reporting","view_route_audit"];
  for (const role of ["owner","admin","manager"]) for (const capability of capabilities) {
    assert.equal(hasRouteCapability(role, capability), true);
  }
});

test("technician and public roles cannot access office route operations", () => {
  assert.equal(hasRouteCapability("staff", "view_own_route"), true);
  assert.equal(hasRouteCapability("staff", "view_all_routes"), false);
  assert.equal(hasRouteCapability("staff", "reassign_jobs"), false);
  assert.equal(hasRouteCapability(null, "view_own_route"), false);
  assert.equal(hasRouteCapability(null, "view_route_map"), false);
});

test("private technician origins are owner and admin only", () => {
  assert.equal(hasRouteCapability("owner", "view_technician_origins"), true);
  assert.equal(hasRouteCapability("admin", "edit_technician_origins"), true);
  assert.equal(hasRouteCapability("manager", "view_technician_origins"), false);
});

test("route reads are isolated by tenant and technician identity", () => {
  assert.equal(canReadTenantRoute({ role:"manager",sessionBusinessId:"a",recordBusinessId:"a",currentUserId:"office" }),true);
  assert.equal(canReadTenantRoute({ role:"manager",sessionBusinessId:"a",recordBusinessId:"b",currentUserId:"office" }),false);
  assert.equal(canReadTenantRoute({ role:"staff",sessionBusinessId:"a",recordBusinessId:"a",currentUserId:"tech-1",technicianUserId:"tech-1" }),true);
  assert.equal(canReadTenantRoute({ role:"staff",sessionBusinessId:"a",recordBusinessId:"a",currentUserId:"tech-2",technicianUserId:"tech-1" }),false);
  assert.equal(canReadTenantRoute({ role:null,sessionBusinessId:null,recordBusinessId:"a",currentUserId:null }),false);
});
