# Servonas Epic 3 setup

## 1. Install and verify

```bash
npm install
npm test
npm run build
```

## 2. Apply the database migration

In Supabase SQL Editor, run:

```text
supabase/epic_3_core_platform.sql
```

Run it after the Epic 2 workspace access fix.

## 3. Test manually

1. Sign in as an owner and open a workspace.
2. Add a customer and confirm the dashboard count and activity update.
3. Search for the customer, then archive it.
4. Update business name, phone, timezone, color, address, and tax rate.
5. Sign in as Staff and confirm settings are read-only and customer writes are unavailable.
6. Sign in as Manager and confirm customer creation works but settings remain read-only.
7. Verify one tenant cannot load another tenant's customer URLs or data.

## Automated tests

`npm test` runs deterministic permission, slug, and redirect-safety tests.

The Playwright suite is included for authenticated smoke testing against a dedicated Supabase test project. Set `E2E_BASE_URL`, `E2E_OWNER_EMAIL`, and `E2E_OWNER_PASSWORD`, then run `npm run test:e2e`. Do not run it against production with destructive test data.
