# Rental date pricing backend

Migration: `20260928000200_rental_date_pricing.sql`. Apply before deploying these server routes. No historical rows are rewritten. No admin or public UI is built in this change; enable date rules only after the public UI consumes the price endpoint so customers see the price before checkout.

## Schema and permissions

`rental_item_pricing_rules` stores business/item ownership, rule type, optional name, weekday (Sunday=0), inclusive start/end dates, fixed cents, active state and timestamps. Specific dates use equal start/end dates. Composite item/business ownership is enforced by a foreign key. RLS permits existing owner/admin/manager roles. No anonymous table access. Active weekday and specific-date duplicates are rejected by unique indexes; active date-range overlaps are rejected by a GiST exclusion constraint, including concurrent writes. This requires PostgreSQL's `btree_gist` extension.

Rules can be disabled or deleted without changing booked snapshots. Database errors become actionable API validation messages. Updating a rule requires its complete validated representation, including rule type and price.

## One rule selector, existing price arithmetic

`public.resolve_rental_date_price` is the only date-rule selector. It selects exactly one rule: specific date > date range > weekday > catalog price. Matching and both range boundaries are inclusive. No rule stacking or percentage overrides.

`resolveRentalDatePrice` calls that SQL function. `resolveRentalItemPrice` loads the tenant item/settings and passes the result to `applyRentalDatePrice` in `lib/rentalPricing.ts`, which calls the existing `calculateRentalUnitPrice`. Checkout, promo validation and amendment previews use this same selection/composition. Existing SQL reservation/addition functions retain their arithmetic and availability locks, substituting the canonical date-selected base. The migration patches the installed function definitions with guarded replacements to retain prior production fixes; an unexpected definition aborts the entire migration.

Order:

1. Original catalog price.
2. Select one fixed price for the rental START DATE in the business timezone.
3. Existing inclusive calendar-day multi-day calculation. Every extra day uses the chosen starting base and the existing full-price, percent-discount, or flat-price setting. Days are not separately date-priced.
4. Existing operator, options and extended-hours/overnight adjustments.
5. Existing promotion engine. Preserve its current eligibility semantics: legacy promos use rental plus operator charges, tiered promos qualify against rental charges, and duration/options/delivery are not newly made discountable by this feature.
6. Add delivery/tax, calculate deposit, and store booking totals using existing checkout behavior.

Example: $225 catalog, $275 Saturday, two days, 25% extra-day discount = $275 + $206.25 = $481.25 before promotions/extras. Flat additional-day prices remain flat.

Date strings are validated business-local civil dates. Timestamps use `dateInTimeZone` first. A Saturday date string is never interpreted as midnight UTC and shifted to Friday. Existing 24-hour calculation helpers are unchanged.

## Snapshots and revalidation

New `booking_items.date_pricing_snapshot` stores original base, adjusted base, applied rule ID/type/name, business-local rental date and version. It intentionally has no foreign key to the rule. Existing fields retain rental days, additional-day amount, base/unit price, duration, operator and option snapshots. Booking-level discount snapshot/cents and final totals remain authoritative; no artificial per-item promotion allocation was introduced.

Checkout resolves server-side, ignores browser amounts, validates promotions using resolved prices, then checks reservation unit price and date metadata against the server quote before creating a payment session. Mismatches expire the pending reservation and require retry. SQL reservation creation also resolves date pricing independently of submitted amounts.

Historical reads use stored booked prices. Rule edits/deletes have no update trigger touching bookings.

## APIs

All management routes resolve the authenticated workspace, check owner/admin/manager conventions, and scope item queries/mutations to that business; RLS additionally protects the table and resolver.

- `GET /api/rental-pricing/{businessSlug}/{itemId}`: list rules.
- `POST` same path: create full rule representation.
- `PATCH` same path: update full rule representation plus `id`; `active:false` disables it.
- `DELETE` same path: `{id}`.
- `GET` same path with `date=YYYY-MM-DD`, optional `endDate`, `additionalHours`, `overnight`: canonical price preview with base, rule, duration and final rental price.
- `POST /api/public-booking/{businessSlug}/rental-prices`: `{itemIds, rentalDate, rentalEndDate?, additionalHours?, overnight?}`. Enabled public business only, active tenant items, maximum 50 items. Returns display prices/labels without internal rule IDs. It fails explicitly if resolution fails; no invented fallback.
- `POST /api/rental-booking-pricing/{businessSlug}/{bookingId}`: `{rentalDate,rentalEndDate?}`. Read-only comparison of existing snapshots versus proposed prices, including promotion review and total difference. Returns `requiresConfirmation` and `applied:false`.

## Booking modifications

New additions use the existing booking's start date, converted with its business timezone. Direct additions check the server-quoted unit amount inside the transaction. Existing lines are not repriced.

Staged additions retain their saved unit price, date snapshot and options after payment, even if date rules change. The SQL transaction rejects changed booking totals or selections instead of applying an inconsistent amendment. Availability is still checked at application. Older staged quotes retain their stored unit amounts even without new date metadata.

Date-change preview is read-only. The existing job edit action checks financial impact when date rules are relevant and blocks financially changed dates until an explicit confirmed pricing-amendment flow is available. It does not implement a new date-change payment/confirmation UI or silently apply repricing. Existing no-rule job-edit behavior is retained. The existing staged amendment machinery supports additions only; a future date-change UI must add a deliberate confirmed application workflow.

## Verification

`tests/rentalDatePricing.test.ts`: shared arithmetic, timezone/civil dates, failed resolver, promo order, snapshots, validation.

`tests/rentalDatePricingDatabase.test.ts`: actual PostgreSQL execution with an isolated minimal preexisting rental schema. Runs the existing reservation/add-item functions and new migration, then exercises precedence, overlap constraints, management CRUD, tenant isolation, reservation snapshots, immutable history, stale additions, frozen staged quotes and read-only date-change preview.

Run the database suite without adding a project dependency:

```sh
npm install --prefix /private/tmp/servonas-date-pricing-test --no-audit --no-fund @electric-sql/pglite
PGLITE_TEST_ROOT=/private/tmp/servonas-date-pricing-test/node_modules/@electric-sql/pglite node --test tests/rentalDatePricingDatabase.test.ts
```

Without `PGLITE_TEST_ROOT` this database test is explicitly skipped. Tests use an isolated PostgreSQL runtime, not production. Run the normal `npm test`, TypeScript and lint as well. Production migration application and production schema parity have not been verified by these local tests.
