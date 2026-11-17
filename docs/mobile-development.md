# Mobile development

The Expo application lives in `apps/mobile`. It is a foundation only: it has
no API client, authentication flow, business data, or server credentials.

## Prerequisites

- Node.js 24 (matches the web application)
- pnpm 10.28.2
- Xcode and an iOS Simulator for local iOS runs

## Install

From the repository root:

```bash
pnpm install --frozen-lockfile
```

pnpm is the supported package manager. Do not run `npm install` or update
`package-lock.json`; its removal requires a separate workflow audit.

## Run

Start the existing Next.js web application:

```bash
pnpm dev
```

Start Expo and choose an iOS Simulator from the Expo terminal:

```bash
pnpm mobile
```

Or start Expo directly for iOS:

```bash
pnpm mobile:ios
```

Validate the mobile project without launching a simulator:

```bash
pnpm mobile:typecheck
pnpm --filter @servonas/mobile check:expo
```

`apps/mobile/eas.json` defines development, preview, and production build
profiles. No EAS build is run or submitted by this foundation PR.

## Environment and secrets

There is deliberately no mobile environment file in this foundation. Future
mobile configuration may contain only public Supabase URL/publishable-key
values. Server-only values such as `SUPABASE_SERVICE_ROLE_KEY`, Stripe secrets,
and Twilio credentials must remain in the Next.js server environment and must
never be added to `apps/mobile` or Expo public configuration.
