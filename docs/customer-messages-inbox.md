# Unified customer messages inbox

The Customers → Messages page reads only `customer_messages` for message history. Customer names are fetched separately with the same business scope. Messages are grouped by customer ID; phone-only history joins a customer thread when that normalized phone has exactly one customer in the history. Ambiguous shared phones stay separate. All history is paginated through database reads, so a row limit does not silently truncate threads or unread counts.

The conversation list shows name/phone, latest text, direction, time and unread count. Threads show chronological inbound and outbound messages regardless of source, including persisted missed-call follow-ups, automated SMS and manual replies. Polling refreshes every 10 seconds. New arrivals remain unread until the conversation is opened (or its Open unread messages button is clicked). Read state is shared workspace state stored in `read_at`; outbound rows are never counted or marked unread.

Every server action authenticates with `requireWorkspace` before obtaining privileged storage. All message, customer, read-state and request-ledger operations include the resulting business ID. Reply destinations come from that business's existing conversation, never a client-supplied phone or business ID. The existing `sendTenantTwilioMessage` resolves the tenant sender, checks consent, sends and persists the outbound row. The action returns that persisted row for immediate rendering.

A synchronous client lock and disabled composer prevent repeat clicks. A service-only database ledger claims each request UUID before contacting Twilio and returns the existing result on a completed retry. Changed payloads cannot reuse a claim. Pending/uncertain/failed claims are retained and never automatically resent: a timeout can happen after provider acceptance. If confirmation fails, refresh and check the thread before composing another send. Provider rejections are displayed with their Twilio error code when available.

## Deployment

1. Confirm the already-completed canonical `customer_messages` migration and centralized outbound/inbound persistence are deployed.
2. Apply `supabase/migrations/20261012000200_customer_message_send_requests.sql` using the usual migration process. It creates the service-only duplicate-send ledger; it performs no backfill.
3. Deploy the application changes, including the existing partial sender and inbound persistence changes if they are not deployed yet.
4. Keep the existing Supabase service-role and tenant Twilio configuration. No new environment variables are required. Confirm Copper State Bounce has an active tenant messaging service and assigned number.
5. Run the acceptance test below with a consenting test recipient.

No migration or deployment was executed as part of local validation. No legacy backfill or AI drafting was added. Historical rows absent from `customer_messages` will not appear in this inbox.

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
