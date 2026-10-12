# Tenant Google Ads tags

Google Ads IDs are public settings on `business_website_settings.google_ads_tag_id`, alongside Meta Pixel IDs. The existing settings action requires workspace capability and an owner/admin role, and writes the resolved business ID. Blank clears the setting; nonblank values must match `AW-` followed by 6–20 digits. Database constraints also enforce the format.

Existing analytics: Meta browser pixels are tenant settings; CAPI credentials remain server environment configuration with a per-pixel token map. Servonas also has its own Google Ads signup tag and label. No GA4, GTM container, or Consent Mode implementation was found. The new tenant tag shares `servonas.analytics_consent` with Meta and the existing consent banner. Nothing is loaded or queued until that value is `granted`. The component observes consent changes; the conversion helper checks consent again on every invocation. Private and preview routes are excluded.

Tenant public website, custom domain, rental detail, promotion, and booking routes inherit their tag from their respective layouts. Stripe success resolves its business from the verified booking/session. The Servonas platform tag no longer initializes on tenant public routes. A shared runtime preserves existing `dataLayer`/`gtag`, reuses a loaded Google tag, and adds at most one gtag.js loader. A GTM container alone is not assumed to contain a Google tag. Configurations are deduplicated and events use explicit `send_to`, following https://developers.google.com/tag-platform/gtagjs/routing . No tenant ID is used as a global default.

`trackGoogleAdsConversion({sendTo, value, currency, transactionId})` requires the destination ID to match the active tenant, a nonempty conversion label, consent, and an available gtag. It sends `transaction_id` and suppresses repeat transaction IDs within the current session, scoped to business and destination. Booking conversions are deliberately inactive; the previous environment-only booking hook no longer fires. Platform signup conversions retain their separate destination.

## Deployment

1. Apply `supabase/migrations/20261012000400_business_google_ads_tag.sql` through the normal migration pipeline before deploying the app. It adds the nullable setting and configures **only** existing business `cb25acc0-3623-4c06-9041-89a88f4ad6ed` with `AW-18406171248`. It does not create a business or change another tenant.
2. Deploy the application. Custom-domain settings caches can take up to five minutes to refresh. No Google Ads environment variable or secret is required.
3. Open CSB → Settings → Website → Online requests → Advertising measurement and verify the Google Ads Tag ID. Owners/admins can edit or clear it.
4. In a fresh browser session, visit CSB's public site. Before consent and after declining, confirm no new Google tag request. Accept analytics; confirm one `gtag/js` request and a config/page_view for `AW-18406171248` using browser Network tools or Google Tag Assistant.
5. Navigate rental, promotion, and booking pages. Confirm the CSB ID remains selected and no duplicate loader is inserted within a document. A full page load normally loads a new copy.
6. Visit a different tenant with no ID: no tenant tag should initialize. Configure that tenant's own ID and verify only its destination receives events. Check hosted `/sites/...`, `/book/...`, and custom-domain routes.
7. Complete a test booking: no Google Ads booking conversion should fire yet. Get the actual booking conversion label/event snippet from Google Ads before wiring the authoritative completion event. Do not reuse the platform signup label.

Implementation is ready for detection after migration/deployment and consent. This change does not itself deploy or verify live Google Ads detection.

## Validation

Run Node's test runner on `tests/googleAds.test.ts`, `tests/tenantGoogleAds.test.ts`, `tests/tenantMetaPixel.test.ts`, `tests/metaPixelFunnelEvents.test.ts`, `tests/metaCapiDeduplication.test.ts`, `tests/metaAdsIntegration.test.ts`, and `tests/analyticsRegression.test.ts`. Set `PGLITE_RUNTIME` to a local `@electric-sql/pglite` module to execute the migration test. Also run TypeScript, ESLint on changed TypeScript files, production build, and `git diff --check`.

## Exact files changed

- `app/app/[businessSlug]/settings/website/actions.ts`
- `app/app/[businessSlug]/settings/website/page.tsx`
- `app/book/[businessSlug]/layout.tsx` (new)
- `app/sites/[siteSlug]/layout.tsx` (new)
- `app/sites/domain/[domain]/layout.tsx` (new)
- `app/success/page.tsx`
- `components/ConsentAwareGoogleTag.tsx`
- `components/TenantGoogleAdsTag.tsx` (new)
- `lib/businessWebsite.ts`
- `lib/googleAds.ts`
- `lib/googleTag.ts` (new)
- `supabase/migrations/20261012000400_business_google_ads_tag.sql` (new)
- `tests/googleAds.test.ts`
- `tests/tenantGoogleAds.test.ts` (new)
- `tests/tenantMetaPixel.test.ts`
- `tests/metaPixelFunnelEvents.test.ts`
- `tests/metaAdsIntegration.test.ts`
- `docs/tenant-google-ads-tag.md` (new)

Meta regression tests had stale source-shape assertions (current gallery click handler, schema-wrapped homepage, expanded booking settings select, and stored Google/Meta spend provider). These were updated without altering Meta runtime behavior.
