# Multi-item booking, double-booking protection, and blocked dates

## 1. Run the database migration

In Supabase, open **SQL Editor**, paste the contents of:

`supabase/multi_item_booking_and_blocked_dates.sql`

Run it once.

This migration:

- Adds a database-level unique rule preventing the same item from being actively booked twice on the same date.
- Adds the `create_public_booking_multi` function for one booking containing multiple different items.
- Rejects duplicate item IDs in the same booking.
- Adds item/date advisory locking to protect against simultaneous checkout attempts.
- Prevents duplicate blocked-date records.

## 2. Add the admin key to Vercel

Create a strong private value, then add it in Vercel under **Settings → Environment Variables**:

`ADMIN_ACCESS_KEY=your-long-private-password`

Apply it to Production, Preview, and Development as needed. Redeploy after saving it.

Do not commit the value to GitHub. The admin blocked-date tool asks for this key before it can add or remove a date.

## 3. Push the code

From the project directory:

```bash
git add .
git commit -m "Add multi-item booking and blocked dates"
git push
```

Vercel should deploy automatically.

## 4. Test

1. Open `/book`.
2. Select two different items.
3. Choose one available date and complete Stripe Checkout.
4. Confirm Supabase has one booking and two `booking_items` rows.
5. Try booking either item again on the same date; the server must reject it.
6. Open `/admin`, enter the admin key in Blocked dates, choose an item and date, and click **Block date**.
7. Refresh `/book`; that date should be unavailable whenever the blocked item is selected.
