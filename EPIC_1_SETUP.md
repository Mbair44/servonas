# Servonas Epic 1 Setup

1. In Supabase SQL Editor, run `supabase/servonas_multi_tenant_foundation.sql`, then `supabase/epic_1_auth_foundation.sql`.
2. In Supabase Authentication > URL Configuration, set Site URL to your production domain and add these Redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `https://YOUR-SERVONAS-DOMAIN/auth/callback`
3. In Vercel and `.env.local`, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL=https://YOUR-SERVONAS-DOMAIN`
4. Keep email confirmation enabled in Supabase Authentication settings.
5. Test signup, confirmation, login, logout, forgot password, and reset password.

Protected routes live under `/app`. A user must be authenticated, and `/app/[businessSlug]` additionally requires a matching `business_members` row. Epic 2 will create the business and owner membership automatically during onboarding.
