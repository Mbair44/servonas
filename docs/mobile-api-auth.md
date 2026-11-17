# Mobile API authentication foundation

`GET /api/v1/mobile/me` accepts only `Authorization: Bearer <Supabase access token>`.
It does not read Next.js authentication cookies. The server calls Supabase Auth
`auth.getUser(accessToken)` rather than trusting decoded JWT claims, then creates
an anon-key Supabase client carrying the same bearer token for database reads.

The mobile endpoint uses only these existing server environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

They are already public Supabase project configuration values. `SUPABASE_SERVICE_ROLE_KEY`
is neither read nor imported by the mobile API foundation and must never be sent
to the Expo app.

## Authorization behavior

The endpoint reads `business_members`, `businesses`, `technician_profiles`, and
`employees` through the user's JWT/RLS context. A returned workspace requires a
current membership. `technicianEligible` requires all of the following in the
same business: an active technician profile, `is_technician`,
`can_be_assigned_jobs`, a linked employee ID, and an active employee whose
`auth_user_id` is the authenticated user.

Membership role and field eligibility remain separate. A staff member is not a
technician merely because they have a membership. No email-domain or
platform-admin bypass is evaluated by mobile helpers.

`requireMobileWorkspace` and `requireMobileJobAssignment` are the required
future endpoint guards. The assignment guard performs an RLS-bound lookup of an
active `job_assignments` row and returns its primary/helper role; it is not used
to grant broad tenant access.

## Response and error behavior

The response is validated against `meResponseDataSchema` and is emitted as the
PR 2 `{ data, requestId }` envelope. It contains user identity, workspace
identity, membership role, technician eligibility, capabilities, and server
time only. It contains no financial, customer, or job data.

Failures use the PR 2 `{ error: { code, message, requestId, retryable } }`
envelope. Responses are `Cache-Control: private, no-store, max-age=0` and vary
by `Authorization`. Detailed Supabase errors and bearer tokens are logged only
as safe diagnostic codes and are never returned to the client.

## Verification limits

`auth.getUser(accessToken)` delegates credential validation to Supabase Auth,
including normal expiry and invalid-token handling. This repository has no
local production-equivalent Supabase Auth/RLS environment configured, so live
revocation behavior and RLS enforcement have not been asserted here. Do not
claim immediate revocation semantics until those tests run against a dedicated
Supabase integration environment using non-service-role user credentials.
