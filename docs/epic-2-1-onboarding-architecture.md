# Epic 2.1 onboarding architecture

## Checkpoint 1 decisions

Onboarding extends the existing Supabase Auth, `businesses`, `business_members`, server-action, and RLS architecture. It does not introduce a second tenant or authentication model.

- `business_onboarding_states` is the persistent workflow record. Completed steps represent validated work, not page visits.
- `business_entitlements` is the access source of truth. Pilot is provisioned inside `create_business_workspace`, in the same database transaction as the tenant and owner membership.
- `business_onboarding_audit_events` and `business_entitlement_audit_events` are append-only evidence.
- Existing tenants are backfilled as completed and receive active Pilot access, preserving existing behavior. A missing onboarding state is also treated as legacy and never forces a wizard redirect.
- New workspaces start at Step 1 with active Pilot access. Client input cannot choose or modify the entitlement.
- Future paid access reuses the entitlement table by adding a different entitlement key and lifecycle; Stripe is deliberately absent.

The guided UI will progressively save through tenant-scoped server actions. Only owner/admin office roles may change onboarding configuration.
