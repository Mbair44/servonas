# Offline QR attribution — Phase 1

The printed Copper State Bounce URL stays unchanged:

`https://copperstatebounce.com/booking?utm_source=offline&utm_medium=qr&utm_campaign=sandwich_sign`

## Architecture and implementation

- The custom-domain middleware preserves the query string when rewriting `/booking`. `app/sites/domain/[domain]/booking/page.tsx` resolves the published tenant and mounts `TenantBookingFunnelTracker` with the tenant's booking slug.
- The existing tracker captures UTMs into tenant-keyed session storage. It propagates `sv_at` and UTMs into booking links, embedded booking, and the rental checkout URL. Explicit new campaign arrivals now rotate the attribution session; reloads and untagged navigation retain it. This avoids overwriting a previous campaign's immutable server session or ignoring a newly scanned sign.
- Rental checkout now submits sanitized-at-server attribution alongside the session ID. The checkout server awaits the existing atomic, tenant-checked `upsert_booking_attribution_session` before saving the immutable booking snapshot and funnel events. This closes the lost-beacon/race gap. Existing server attribution takes precedence over client-submitted values. Invalid or cross-tenant session IDs cannot read or modify another business's attribution.
- Attribution is attached to the booking **before** creating Stripe Checkout. Stripe metadata retains the session ID. The existing webhook confirms the existing booking and emits events with stable booking-specific keys. Attribution does not depend on the customer returning from Stripe. Invoice-later confirmations use the same booking snapshot.
- The existing source classifier now labels `offline` as **Offline / QR**, instead of Unknown. The existing campaign dropdown includes configured offline campaigns even before their first visit.
- The Website analytics page (`/app/[businessSlug]/marketing/funnel`) adds an **Offline QR campaigns** section using the same session, funnel-event, booking and snapshot tables. An aggregate database function avoids the Supabase row limit. This is not a separate tracking pipeline.

## Metrics and definitions

The new report uses an **arrival cohort**: sessions whose `session_started_at` falls in the selected dates. It follows their eventual outcomes, including bookings confirmed after the selected dates. It matches exact `utm_source=offline`, `utm_medium=qr` and campaign. Known automated sessions are excluded; unidentified bots can still be counted.

| Metric | Definition |
| --- | --- |
| Visits | Distinct attribution sessions arriving with these tags. Not unique people or physical scans. |
| Booking page visits | Sessions landing on the booking page or with a booking-start/reservation-details event. |
| Checkout starts | Sessions with an existing checkout-start or initiate-checkout event; client/server repeats count once. |
| Completed bookings | Distinct tenant bookings linked through the session snapshot, in the existing confirmed/paid/scheduled/active/completed status family. Pending, expired and canceled bookings are excluded. |
| Booked revenue | Full `bookings.total_cents` for those bookings, including unpaid balances, taxes and delivery. Not deposits or collected cash; not profit or net revenue after refunds. |
| Conversion rate | Sessions with at least one eligible booking ÷ visits. Multiple bookings in one session do not inflate the rate above 100%. |
| One-time campaign cost | The campaign's full recorded cost, independent of report dates. CSB `sandwich_sign` = 5,000 USD cents. |
| Return on campaign spend | Cohort booked revenue ÷ entire one-time campaign cost. Use dates spanning the campaign's life for cumulative ROAS. Unknown/zero cost shows no ratio. |

The campaign and date filters apply to this section. Source, device and first/last-touch selectors do not alter its arrival-cohort definition; the UI explicitly says so. The main analytics report retains its existing date/model behavior. The two reports need not have identical totals.

Existing retained, correctly tagged sessions and booking snapshots are measurable immediately after migration/deployment. No historical data is fabricated or backfilled. New instrumentation hardens attribution for **future** arrivals and rental checkouts where the analytics request was lost. The $50 cost and dedicated reporting are new. Physical scan counts, unique scanners, cross-device attribution and profit require additional data and are not claimed.

## Consent and limitations

Existing Servonas rules are preserved: the first-party operational booking funnel uses its existing independent feature flag and per-tab session storage; a persistent analytics visitor ID and cross-session touch stitching require the existing analytics consent. This change adds no banner, persistent visitor identifier, Meta event, Google conversion or advertising request. The offline report uses same-session booking snapshots, not consentless visitor stitching.

- Reloading an existing tab retains a session. Repeated scans in that tab with the same campaign are not separately counted. A new tab/device or cleared/blocked storage can create another session; these are not person counts.
- Links copied/shared with the printed UTMs receive the same credit. Ordinary untagged visits are not assigned to the sign.
- Blocked JavaScript, disabled funnel collection, unavailable storage across full-page navigation, or database outages can lose attribution. Checkout safely continues if its analytics parent cannot be saved; a structured warning includes business ID and error code, no contact details. This is not a transactional guarantee during a database outage.
- Rental checkout is hardened in this pass (including CSB). Other service-booking flows retain their existing instrumentation; this does not introduce rental-style Stripe checkout into service bookings.
- Cost is maintained by migration/admin database workflow in Phase 1. There is no campaign editor, QR generator or redirect endpoint yet.

## Deployment and acceptance

1. Apply `supabase/migrations/20261013000100_offline_qr_campaign_reporting.sql` through the normal migration workflow, then deploy the app. The migration seeds the $50 expense **only** for business `cb25acc0-3623-4c06-9041-89a88f4ad6ed`, if that record exists. Rerunning the seed cannot duplicate the expense. Members can read their own costs; public users cannot read them or call the report. The existing authenticated platform-admin workspace path can use its server-only service role to inspect the explicitly selected tenant.
2. In a fresh browser tab, open the exact printed URL. Follow the existing consent choice; first-party session attribution should work either way without enabling additional advertising events.
3. Open CSB → Marketing → Website analytics and select dates including today and campaign `sandwich_sign`. The offline section should show one visit and one booking-page visit. Refresh the public tab several times: the counts stay at one.
4. Select a rental/date and proceed to checkout. Confirm `sv_at` and the three UTMs persist in the checkout URL and request. Start checkout: one checkout session is counted despite client/server event repeats.
5. In a test tenant/payment environment with identical tags, complete a booking using Stripe test mode. A $250 booking with a $50 deposit must report one completed booking and $250 booked revenue, not $50. The $50 campaign expense gives 5.00× return. No live payment was made by the implementation tests.
6. Replay the Stripe webhook and refresh the return page: the same booking remains counted once. Cancel the booking: it is excluded from eligible booked revenue.
7. Open a previously used tab with different campaign attribution and then the printed URL: the new arrival must receive `sandwich_sign`, without old click IDs. An untagged navigation within that session must retain the QR attribution.
8. Switch to another workspace: CSB's visits, bookings and seeded expense must not appear. A fresh untagged visit to another tenant must not inherit the QR campaign.

## Phase 2 plan — not implemented

1. Introduce a tenant-owned campaign record with immutable campaign key, editable display name, validated destination, active state, and timestamps. Reuse the existing attribution snapshot/session fields. Relate the Phase 1 expense to the campaign and allow additional dated campaign costs with currency handling.
2. Add a workspace campaign editor and printable/downloadable QR assets. Generate codes containing a stable tenant-scoped redirect URL such as `https://copperstatebounce.com/q/<opaque-campaign-token>`. Keep the destination editable without reprinting. Validate same-tenant approved destinations to prevent open redirects.
3. Resolve the incoming hostname and token to the same tenant, record a minimal server-side redirect hit, then issue a temporary redirect to the destination with the campaign UTMs. Avoid caching redirects in a way that bypasses counting. Keep bots/prefetches and short-window repeats identifiable, minimize data retention, and fit the existing consent model before introducing any persistent identifier.
4. Distinguish **raw redirect hits**, **estimated scans**, **website sessions**, and **bookings** in reporting. A redirect improves scan measurement because it observes requests before page JavaScript runs; it still cannot prove a physical scan or unique person (previews, bots and shared URLs also request redirects).
5. Join the campaign to existing sessions/bookings via its stable UTM key; reuse confirmed booked-revenue reporting and tenant membership checks. Add tests for token/host tenant isolation, safe redirects, inactive campaigns, repeat hits, bot handling, consent and booking attribution.

CSB's current printed URL cannot gain redirect-based scan counts retroactively. Keep it working permanently; only future printed QR codes use the redirect endpoint.

## Validation performed

- 111 focused tests passed, with no skips: new QR attribution/database tests, first/last touch, atomic session persistence, booking funnel write paths and click idempotency, direct rental checkout, existing source classification, Meta Pixel and CAPI deduplication. The SQL tests executed the actual migration in PGlite, including anonymous/member/service-role access checks.
- `npx tsc --noEmit` passed.
- Scoped ESLint passed with two existing hook-dependency warnings in `PartyRentalBookingClient.tsx`.
- `npm run build` passed (existing repository warnings).
- `git diff --check` passed.
- A broader run also found three pre-existing assertions failing in `bookingFunnelDemandCalendar.test.ts` and `bookingFunnelInventoryDemand.test.ts`. The same three failures were reproduced from an untouched `HEAD` export. No production migration, live booking/payment, or deployment was performed.
