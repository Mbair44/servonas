# NRS Party Rentals

Clean project baseline with:

- Public homepage powered by Supabase inventory
- Live availability calendar
- Booking form and public booking API
- Confirmation page
- Admin dashboard

## Run locally

1. Copy `.env.local.example` to `.env.local`.
2. Add your Supabase publishable key.
3. To use `/admin`, also add your private Supabase service-role/secret key. Never share or commit it.
4. Run:

```bash
npm install
npm run dev
```

Open the URL printed in Terminal, usually `http://localhost:3000`.

Routes:

- `/` homepage
- `/book` booking page
- `/admin` admin dashboard
- `/success` booking confirmation

## Database

The required SQL scripts are in `supabase/`. The project assumes the schema, live availability function, and public booking function have already been run in Supabase.
# NRS-Rentals
