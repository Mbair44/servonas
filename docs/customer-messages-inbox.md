# Unified customer messages inbox

The standalone Messages page (`/app/[businessSlug]/messages`; existing Customers → Messages links remain supported) reads only `customer_messages` for message history. Customer names are fetched separately with the same business scope. Messages are grouped by customer ID; phone-only history joins a customer thread when that normalized phone has exactly one customer in the history. Ambiguous shared phones stay separate. All history is paginated through database reads, so a row limit does not silently truncate threads or unread counts.

The conversation list shows name/phone, latest text, direction, time and unread count. Threads show chronological inbound and outbound messages regardless of source, including persisted missed-call follow-ups, automated SMS and manual replies. Polling refreshes every 10 seconds. New arrivals remain unread until the conversation is opened (or its Open unread messages button is clicked). Read state is shared workspace state stored in `read_at`; outbound rows are never counted or marked unread.

Every server action authenticates with `requireWorkspace` before obtaining privileged storage. All message, customer, read-state and request-ledger operations include the resulting business ID. Reply destinations come from that business's existing conversation, never a client-supplied phone or business ID. The existing `sendTenantTwilioMessage` resolves the tenant sender, checks consent, sends and persists the outbound row. The action returns that persisted row for immediate rendering.

A synchronous client lock and disabled composer prevent repeat clicks. A service-only database ledger claims each request UUID before contacting Twilio and returns the existing result on a completed retry. Changed payloads cannot reuse a claim. Pending/uncertain/failed claims are retained and never automatically resent: a timeout can happen after provider acceptance. If confirmation fails, refresh and check the thread before composing another send. Provider rejections are displayed with their Twilio error code when available.

## Deployment

1. Confirm the already-completed canonical `customer_messages` migration and centralized outbound/inbound persistence are deployed.
2. Apply `supabase/migrations/20261012000200_customer_message_send_requests.sql` using the usual migration process. It creates the service-only duplicate-send ledger; it performs no backfill.
3. Deploy the application changes, including the existing partial sender and inbound persistence changes if they are not deployed yet.
4. Keep the existing Supabase service-role and tenant Twilio configuration. No new environment variables are required. Confirm Copper State Bounce has an active tenant messaging service and assigned number.
5. Run the acceptance test below with a consenting test recipient.

Initial local validation did not apply migrations or deploy the application. During the subsequent live send-error investigation, the send-request table was confirmed missing from the Copper State Bounce database; migration `20261012000200` was then applied through the Supabase SQL editor. The initial inbox slice did not add legacy backfill or AI drafting. The subsequent user-requested booking-history import is described below; AI drafting remains out of scope.

## Exact acceptance test

1. Sign in and open Copper State Bounce → Customers → Messages.
2. Find the customer who replied to the missed-call SMS; verify the list preview, time, direction and unread badge.
3. Open the conversation. Verify the outbound missed-call text and inbound reply appear in chronological order in the same thread.
4. Type “Thanks for getting back to us!” in Reply.
5. Click Send. Verify Send and the composer are disabled while sending; rapid repeat clicks must not send twice.
6. On the customer's phone, verify exactly one message arrives from the Copper State Bounce number.
7. Verify the sent message appears immediately in the thread without a page refresh.
8. Reply from the customer's phone.
9. Wait up to 10 seconds for polling (plus webhook processing). Verify the new inbound message and unread badge appear, even if the thread is selected.
10. Click the conversation again or Open unread messages. Verify the unread badge clears. Refresh the page and reopen the thread; verify it stays read.

Additional checks: repeat with an unknown phone-only contact; sign in to a different business and verify Copper State Bounce's conversations are unavailable; attempt a send to an opted-out test recipient and verify a useful error without an outbound success bubble.

## Local validation

- `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/customerMessages.test.ts tests/twilio*.test.ts`: 77 passed, 1 skipped (optional PostgreSQL test requires `PGLITE_RUNTIME`), 0 failed.
- `npx tsc --noEmit`: passed.
- Scoped ESLint on the inbox directory, `lib/customerMessages`, and `tests/customerMessages.test.ts`: passed.
- `git diff --check`: passed.

The nine added tests exercise grouping, known and unknown contacts, chronological history, business identity passed to the sender, persisted reply return, repeated and concurrent requests, validation, unread/read state and tenant isolation. Existing Twilio tests are unchanged. Database behavior in the new focused tests uses a query-executing in-memory fake; live SMS delivery remains a deployment acceptance check.


## Booking history and standalone navigation

Migration `20261012000300_booking_sms_history.sql` imports provider-accepted customer SMS from `job_communication_events` and `sms_messages` into `customer_messages`. It uses the job/booking business ID, verifies customer membership in that business, and preserves sent timestamps. Customer-facing job templates are allowlisted; internal manager alerts, email, queued/failed/stubbed events and records without a valid provider SID are excluded. Unique provider IDs prevent duplicate rows and preserve canonical content and read state on reruns. Triggers capture subsequent legacy booking sends as well.

Where the old log omitted text, the inbox explicitly labels it unavailable/pending instead of reconstructing it from current templates. Opening Messages starts bounded recovery batches (five records every 15 seconds) using read-only Twilio GET requests. Each recovered message must match the recorded SID, provider account, outbound direction and normalized recipient. Tenant-account ownership is checked before resolving credentials; older parent-account sends use the existing legacy identity only when no tenant usage mapping exists. A per-record database lease prevents duplicate fetches across tabs and backs off failures for an hour. No history operation sends SMS.

Live verification in the Copper State Bounce database: 36 historical booking messages imported, yielding 46 total messages across 17 conversations. Two imported messages had stored bodies; 34 require provider retrieval. These history rows were confirmed visible in the live inbox. Migration was applied through the SQL editor; repeat execution is safe.

Deploy the application changes to enable the standalone **Messages** navigation link and automatic body recovery. The database migration is already applied to the inspected live project; apply it first in other environments. No new environment variables are needed. Old `/customers/messages` deep links still work; the primary URL is `/messages`.

Validation: 86 tests passed, no skips, including the PostgreSQL migration and existing Twilio PostgreSQL test with `PGLITE_RUNTIME` configured. TypeScript, scoped lint and diff whitespace checks passed. Live Twilio body recovery awaits deployment; Twilio-retention limits or a changed recipient number can leave a clearly labeled historical record without its original text.

Acceptance: open Messages from the sidebar; check previous booking confirmations, reminders, payment messages and review requests; wait for missing bodies to be retrieved; verify the original chronological order and that no texts are sent by importing. Refresh and confirm no duplicate history and unchanged unread counts. Verify an old Customers → Messages link still opens the inbox and highlights only the standalone Messages item.
