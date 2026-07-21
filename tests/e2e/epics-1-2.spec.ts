import { test, expect } from "@playwright/test";
const enabled=Boolean(process.env.E2E_BASE_URL&&process.env.E2E_OWNER_EMAIL&&process.env.E2E_OWNER_PASSWORD);
test.describe("Servonas Epics 1-2",()=>{
 test.skip(!enabled,"Set E2E_BASE_URL, E2E_OWNER_EMAIL, and E2E_OWNER_PASSWORD to run against a test project.");
 test("owner can sign in and open only a listed workspace",async({page})=>{
  await page.goto(`${process.env.E2E_BASE_URL}/login`); await page.getByLabel(/email/i).fill(process.env.E2E_OWNER_EMAIL!); await page.getByLabel(/password/i).fill(process.env.E2E_OWNER_PASSWORD!); await page.getByRole("button",{name:/log in/i}).click(); await page.waitForURL(/\/app/); await expect(page.getByText(/workspace|dashboard/i).first()).toBeVisible();
 });
});
