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
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed in Terminal, usually `http://localhost:3000`.

Routes:

- `/` homepage
- `/book` booking page
- `/admin` admin dashboard
- `/success` booking confirmation

## Database

The required SQL scripts are in `supabase/`. The project assumes the schema, live availability function, and public booking function have already been run in Supabase.

## Development workspaces

This repository uses pnpm workspaces. The production Next.js application is the
repository root; the legacy `servonas/` directory is intentionally excluded.

Run the web app:

```bash
pnpm dev
```

Run the Expo mobile foundation:

```bash
pnpm mobile
# or: pnpm mobile:ios
```

See [Mobile development](docs/mobile-development.md) for prerequisites and
mobile-specific commands. pnpm is the supported package manager for this
repository. `package-lock.json` remains temporarily for workflow compatibility
and must not be updated; it will be removed only in a separately approved
cleanup after dependent workflows have been confirmed.
# NRS-Rentals
# Google Ads signup conversion

The completed-account conversion uses the existing global Google tag in `app/layout.tsx`.
`NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION` is optional; when omitted it defaults to
`AW-18340749438/-fjTCKncxtscEP7AxqlE`.

