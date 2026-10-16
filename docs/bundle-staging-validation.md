# Bundle checkout staging validation

Use an isolated Supabase project and Stripe test-mode connected account. Never point these settings at production.

Required environment values: `SUPABASE_ACCESS_TOKEN`, a staging project reference, staging `NEXT_PUBLIC_SUPABASE_URL`, staging anon and service-role keys, `STRIPE_SECRET_KEY` beginning with `sk_test_`, and a staging `NEXT_PUBLIC_SITE_URL`.

1. Link the staging project with `supabase link --project-ref <staging-project-ref>` and apply migrations with `supabase db push`.
2. Confirm the `rental_bundles`, child tables, bundle booking snapshots, RLS policies, and `create_bundle_booking` function exist. Test a non-member read and a non-manager write are rejected.
3. Create only staging inventory and a published staging test bundle: one customer-selectable inflatable, one fixed table, ten fixed chairs, and one paid inflatable upgrade.
4. Complete weekday and Friday–Sunday Stripe test-mode checkouts. Verify the package total, deposit, remaining balance, itemized tax allocations, reservations, Stripe webhook idempotency, invoice, and Manage Booking package display.
5. Exercise a declined card, repeated webhook delivery, conflicting reservation, cancellation, reschedule, promotion rejection, and a standalone rental checkout.
6. Leave production bundle discovery and bundle checkout disabled until all results pass and are reviewed.
