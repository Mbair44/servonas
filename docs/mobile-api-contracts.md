# Mobile API contracts (v1)

`@servonas/shared` owns DTO schemas for future `/api/v1/mobile` route handlers
and the Expo app. It has no API client, Supabase client, credentials, database
access, or authorization implementation.

The exported `mobileApiPaths` map is the versioned route vocabulary. It names
future routes only; this PR creates none of them.

## Envelope

Every successful response uses:

```json
{
  "data": {},
  "requestId": "9f8c5a7a-35cc-4d89-b935-2cb1917b6f93"
}
```

Every failure uses:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have access to this resource.",
    "requestId": "9f8c5a7a-35cc-4d89-b935-2cb1917b6f93",
    "retryable": false
  }
}
```

Dates are RFC 3339 timestamps with an explicit offset. Civil dates use
`YYYY-MM-DD`. Cursor pagination is opaque: clients may send `limit` (1–100)
and a prior `cursor`, and must not inspect cursor values.

## `/me` example

```json
{
  "data": {
    "user": {
      "id": "c3fa33e3-9366-4ad5-8fca-58bd883d780d",
      "email": "owner@example.com",
      "displayName": "Avery Owner"
    },
    "workspaces": [
      {
        "id": "cf1f4f72-8f5a-4c06-96d1-0b5fa64c03e6",
        "displayName": "Acme Services",
        "membershipRole": "owner",
        "technicianEligible": false,
        "availableCapabilities": ["operational_dashboard", "financial_dashboard"]
      }
    ],
    "serverTime": "2026-11-16T18:45:00.000Z"
  },
  "requestId": "9f8c5a7a-35cc-4d89-b935-2cb1917b6f93"
}
```

## Authorization vocabulary

Membership roles are `owner`, `admin`, `manager`, and `staff`. They are not
technician roles. `technicianEligible` represents a separate active field
profile; staff membership never implies it.

The capability list is descriptive for navigation and presentation only. Route
handlers must independently verify bearer authentication, tenant membership,
role, technician profile, job assignment, and primary/helper assignment scope.
No `platform_admin` email-domain bypass exists in these contracts.

- Owners/admins may receive operational and financial dashboard data.
- Managers may receive operational dashboard data only.
- Staff receive no owner dashboard in Phase 1.
- Technicians receive assigned-job data only.
- Only the primary technician may transition a shared job. Helpers can receive
  note/photo permissions, but never `transition_status`.

## Defined endpoint DTOs

- `meResponseSchema`
- `ownerManagerDashboardResponseSchema`
- `technicianHomeResponseSchema`
- `jobDetailResponseSchema`
- `transitionJobStatusRequestSchema`
- `addJobNoteRequestSchema`
- `foregroundLocationRequestSchema`

Future API routes import these schemas from `@servonas/shared`; they must not
return raw database rows or expose server-only configuration.
