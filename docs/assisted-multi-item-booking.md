# Admin multi-item rental bookings

Apply `supabase/migrations/20260929000100_assisted_multi_item_booking.sql` before deploying the application changes. The additive migration does not backfill or reprice historical bookings. Shared displays fall back to inventory names for older bookings.

The admin action authorizes the workspace and customer-management role, validates tenant inventory, and invokes the service-role-only `create_assisted_rental_booking` wrapper. The wrapper calls the existing `create_public_booking_quantities_timed` function once for the full selection, keeping its resource locks, date pricing snapshots, conflict checks, booking items, and inventory reservations. Staff-confirmed money, item-name/price snapshots, and consent are saved in that same transaction. An unavailable item or failed consent write rolls everything back.

This remains the existing staff-confirmed, single-date flow: catalog unit prices prefill the form and staff confirm any date-specific or negotiated price. Discount, delivery, and tax remain explicit amounts, applied once per booking. Subtotal is normally the sum of quantity × unit price; an explicit override preserves the agreed booking-level price and records its difference in the assisted pricing snapshot. The deposit defaults to the business percentage of the final total and retains an explicit manual override. A positive deposit is required by the existing payment-link flow.

The form preserves entries on failure and suppresses repeated submissions. Its request key makes reservation retries idempotent; changed details after a successful reservation cannot silently replace the saved booking. Job/payment-link failures return a held-booking message instead of creating a new reservation. Existing payment-link, current SMS consent, authorization, and balance collection helpers remain in use.

Confirmation SMS uses the first item plus the number of additional items; email and job descriptions list every line. Manage Booking renders all lines and prefers their saved names.

Targeted PostgreSQL tests can run using a temporary PGlite installation, without touching production:

```sh
PGLITE_TEST_ROOT=/path/to/node_modules/@electric-sql/pglite node --test tests/assistedRentalBookingDatabase.test.ts
```
