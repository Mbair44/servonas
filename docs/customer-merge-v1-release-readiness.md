# Customer Merge V1 release readiness

## Database certification (required, not executed here)

Run only against a new isolated Supabase/Postgres database. Apply the approved baseline migrations in lexical order, then:

```sh
npx supabase db reset --local
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/customer_merge_integration.sql
```

The integration fixture must create owner, admin, manager, cross-tenant, primary, duplicate, billing, address, consent, booking, invoice, payment, refund, payment-attempt, recurring-plan, message, and public-token fixtures. It must exercise preview/confirm as each role and with independent connections for merge/write races. Required assertions: atomic rollback, tenant isolation, audit immutability, stale previews, identical and conflicting idempotency keys, historical financial totals, Stripe blockers, exact-channel STOP/unsubscribe, canonical reads, public-token boundary, and legacy SMS behavior.

## Migration and rollout

1. Verify the actual deployed Git commit and applied migration list; reconcile with `main` before release.
2. Take and verify a database backup, then apply `20261124000100` through `20261124000400` in order to staging first.
3. Run the fixture above and application smoke tests with synthetic records only.
4. Keep merge unavailable until database certification and a production change approval are complete. No customer merge is reversible by a migration rollback; rollback only disables access and preserves audit/history.
5. In production, monitor RPC errors by blocker code, audit insert counts, lifecycle trigger failures, message suppression rates, and payment/invoice totals. Smoke-test one synthetic tenant only after explicit approval.

## Stripe eligibility

Historical paid deposits, invoices, refunds, and completed payment attempts alone are eligible because their customer IDs are preserved. V1 blocks a duplicate Stripe customer identity, different identities, active saved payment methods, autopay, recurring auto-charge, and pending payment attempts. This intentionally avoids changing future authorization, default payment methods, or Stripe objects.

## Remaining certification gates

- Execute all database integration tests above.
- Verify all outbound workers query the exact-channel ledger in a staged environment.
- Reconcile current production migrations and the paused pricing branch before deployment.
- Perform responsive browser validation against local synthetic data.
