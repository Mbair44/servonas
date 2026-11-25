# Customer Merge V1 dependency matrix

| Dependency | V1 rule |
| --- | --- |
| Active jobs, open estimates, locations, recurring plans | Reassign to primary. Auto-charge plans block the merge. |
| Completed/cancelled jobs, bookings, invoices, payments, refunds, billing audit | Preserve original foreign key; resolve canonically in PR 3 reads. |
| Billing profiles/payment methods | Block whenever the duplicate has a Stripe identity, active saved method, autopay, auto-charge plan, or an in-flight attempt. No provider data moves. |
| Contacts/channels/addresses | Channels and addresses consolidate; exact-channel opt-out wins. Legacy contact rows remain historical until PR 3 read-model adoption. |
| Customer messages, inbound SMS, missed-call recovery | Reassign to primary; raw provider IDs and consent ledgers remain unchanged. |
| Campaign recipients, review associations, Smart Upsells, funnel/attribution, public tokens | Preserve original identity and resolve canonically in internal reads. Public access is never canonicalized. |
| External references, HVAC equipment, employee preferences | Reassign to primary. |
| Pool logs, property measurements, voice calls | Preserve original historical identity; resolve canonically in internal reads. |

The confirmation RPC has no outbound side effects and does not call Stripe, Twilio, email, webhooks, campaigns, or queues.
