# Epic 4.5 — Online Booking Portal

## Deploy
1. Run `supabase/epic_4_5_public_booking.sql` in Supabase SQL Editor after the Epic 4 migration.
2. Confirm Vercel has `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SITE_URL`.
3. Deploy the project.
4. Open **Online booking** in a workspace, add services, set hours, enable the public page, and save.

## Connect a customer website
Use the booking link or copy the iframe shown on the Online booking page. The public form securely creates/matches a customer, creates a website-sourced job, and adds it to the Servonas dashboard.

## Security
The public page never exposes the service-role key to the browser. Submission is handled in a server action, business/service IDs are revalidated, time conflicts are rechecked, and a honeypot field reduces simple bot spam.
