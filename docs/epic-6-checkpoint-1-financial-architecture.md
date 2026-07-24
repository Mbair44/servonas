# Epic 6 Checkpoint 1 financial architecture

## Money model

New financial-domain amounts are integer minor units (`bigint` columns ending in
`_cents`) with an ISO 4217 currency code. USD is the default. Quantities are
decimal values with at most four fractional digits; tax and percentage
discounts use integer basis points (`10000 = 100%`).

The server calculation service is authoritative. It calculates each line,
rounds each line subtotal and each line tax half-up to the nearest cent, then
sums the rounded lines. Document discounts are allocated proportionally across
post-line-discount amounts before tax. The final calculation is:

`grand total = subtotal - discounts + tax + fees`

`net paid = captured payments - successful refunds`

`balance due = max(grand total - net paid, 0)`

The existing `jobs.subtotal`, `tax_amount`, `discount_amount`, and generated
`total_amount` remain decimal-dollar compatibility fields for existing screens.
New documents do not treat jobs as a financial ledger. Later conversion code
must explicitly convert dollars to cents and copy immutable line snapshots.

## Versioning and immutability

An estimate has a current version number. Sending or materially revising a sent
estimate creates an immutable `estimate_versions` snapshot containing document
and line JSON plus a hash. Acceptance stores the exact accepted version.
Accepted, converted, and void estimates cannot have financial totals changed.

Paid, refunded, and void invoices cannot have financial totals changed.
Payments, refunds, and estimate-version snapshots cannot be deleted. Corrections
use a revision, void, additional payment, or refund.

## Numbering and conversion idempotency

`next_financial_document_number` atomically upserts and increments a
business/document-type sequence row. Numbers are unique per business, never
derived from row counts, and soft deletion does not release them.

Estimate-to-job conversion uses `(business_id, conversion_key)` and
`converted_job_id`; invoice source creation uses `(business_id, source_key)`.
These keys allow a later server transaction to retry without duplicate output.

## Public-token model

Public estimate and invoice links will use at least 256 bits of cryptographic
randomness. Only a SHA-256 token hash is stored. Lookups run through server-side
code and also verify document type, business scope, expiration, and revocation.
Raw tokens are never logged or returned by database queries after creation.
Checkpoint 1 does not expose a public route.

## Roles and RLS

Owner, admin, and manager roles can read and mutate tenant-scoped financial
records. Ordinary staff and technicians receive no financial-table policy in
Checkpoint 1. This intentionally prevents technicians from seeing unrelated
customers' financial records, costs, payment accounts, refunds, or tax settings.
Future technician billing permissions must be explicit and job-scoped.

Webhook events have no authenticated-client policy. Public customers never
query financial tables directly. Service-role access remains server-only.

## Stripe Connect recommendation

Use Stripe Connect Express when payment implementation begins. Express keeps
each tenant's funds and connected account separate, supports application fees,
refunds, disputes, webhook account routing, payout visibility, and hosted
onboarding while requiring substantially less platform compliance and account
UI than Custom.

Standard offers the least platform control and a more disconnected onboarding
and support experience. Custom creates the greatest compliance, onboarding,
support, and account-management burden and is not justified for the current
product.

Checkpoint 1 stores only provider account identifiers and capability state. It
does not store secrets or call Stripe.

## Webhook idempotency

`payment_webhook_events` uniquely identifies `(provider, provider_event_id)`.
It stores processing state, attempts, payload hash, and limited safe metadata.
It deliberately does not store raw card data or an unrestricted provider
payload. Processing will claim a row before applying a financial transition.
