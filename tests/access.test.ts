import { describe, expect, it } from "vitest";
import { canManageBusiness, canManageCustomers, safeNextPath, validWorkspaceSlug } from "../lib/access";
describe("workspace permissions",()=>{
 it("limits business settings to owners and admins",()=>{expect(canManageBusiness("owner")).toBe(true);expect(canManageBusiness("admin")).toBe(true);expect(canManageBusiness("manager")).toBe(false);expect(canManageBusiness("staff")).toBe(false)});
 it("allows managers to maintain customers",()=>{expect(canManageCustomers("manager")).toBe(true);expect(canManageCustomers("staff")).toBe(false)});
});
describe("auth and onboarding validation",()=>{
 it("accepts canonical workspace slugs",()=>{expect(validWorkspaceSlug("mbair")).toBe(true);expect(validWorkspaceSlug("nrs-party-rentals")).toBe(true);expect(validWorkspaceSlug("NRS Party")).toBe(false)});
 it("rejects open redirects",()=>{expect(safeNextPath("/invite/accept?token=1")).toBe("/invite/accept?token=1");expect(safeNextPath("https://evil.test")).toBe("/app");expect(safeNextPath("//evil.test")).toBe("/app")});
});
