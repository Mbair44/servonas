# Connect the NRS website to Supabase

## 1. Run the availability function

In Supabase, open SQL Editor, create a new query, paste the contents of:

`supabase/live_availability.sql`

Click Run.

## 2. Confirm `.env.local`

At the project root, create or update `.env.local`:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://epmnvizlyhftbqoomiql.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
```

Do not put a service-role key in a NEXT_PUBLIC variable.

## 3. Restart the app

Stop the development server with Control+C, then run:

```bash
npm run dev
```

The homepage now loads active inventory and prices from Supabase. The booking page reads booked and manually blocked dates from Supabase.
