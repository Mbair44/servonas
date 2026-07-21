# Test the booking flow

1. Keep your existing `.env.local` file in the project root.
2. Run `npm install` if needed.
3. Run `npm run dev`.
4. Open `http://localhost:3000/book`.
5. Choose an available date, complete the form, accept the agreement, and submit.
6. Confirm a confirmation number appears.
7. In Supabase, verify new rows in `customers`, `bookings`, and `booking_items`.
8. Return to `/book` and confirm the chosen date is unavailable.

No payment is collected yet. The booking uses the `create_public_booking` SQL function you already installed.
