# Booking test setup

1. In Supabase, open **SQL Editor → New query**.
2. Paste and run `supabase/create_public_booking.sql`.
3. Confirm `.env.local` still contains your Supabase URL and publishable key.
4. Restart the development server:

```bash
npm run dev
```

5. Open `http://localhost:3000/book`, select an available date, complete the form, and submit.
6. Confirm the reservation appears in Supabase under:
   - `customers`
   - `bookings`
   - `booking_items`
7. Refresh the booking calendar. The submitted date should now be red/unavailable.

No payment is collected in this stage.
