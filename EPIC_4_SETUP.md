# Epic 4 — Jobs & Work Orders

Epic 4 replaces the narrow “bookings” concept with generalized jobs so Servonas can support rentals, HVAC, landscaping, cleaning, and other service businesses.

## Install

1. Run `supabase/epic_3_core_platform.sql` again to apply tenant-scoped customer email uniqueness.
2. Run `supabase/epic_4_jobs.sql` in Supabase SQL Editor.
3. Commit and deploy the application.

## Included

- Friendly duplicate-customer email errors
- Tenant-scoped, case-insensitive customer email uniqueness
- Jobs list and status filtering
- Job creation and editing
- Customer assignment
- Scheduling, address, notes, subtotal, tax, and total
- Status history and dashboard metrics
- Multi-tenant RLS and activity logging
