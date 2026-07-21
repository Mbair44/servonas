# Servonas Epic 2 Setup

Epic 2 adds real business onboarding, automatic owner membership, secure workspaces, and employee invitations.

## 1. Run the migration

In Supabase SQL Editor, run:

```text
supabase/epic_2_business_onboarding.sql
```

Run it after the Phase 1 and Epic 1 migrations.

## 2. Environment variables

Keep the Epic 1 variables and add this server-only variable in Vercel:

```text
SUPABASE_SERVICE_ROLE_KEY
```

Never prefix this key with `NEXT_PUBLIC_` and never expose it in browser code. It is used only to ask Supabase Auth to deliver invitation emails. Workspace creation and tenant security still use the signed-in user's session and database RLS.

## 3. Supabase Auth URLs

Add these redirect URLs in Supabase Authentication > URL Configuration:

```text
https://your-domain.com/auth/callback
http://localhost:3000/auth/callback
```

## 4. Test

1. Sign up and verify an owner account.
2. Open `/onboarding` and create a business.
3. Confirm you land on `/app/[businessSlug]` as owner.
4. Invite a second email as Staff.
5. Open the invitation email or copied invitation link, sign in as that email, and accept.
6. Confirm the employee can open that workspace but cannot manage invitations.
7. Create a second business under another owner and confirm neither account can open the other's slug.

## Security notes

- Business creation and owner membership happen in one atomic Postgres function.
- Invitation acceptance verifies the authenticated user's email against the invited email.
- RLS restricts business, membership, and invitation access by authenticated membership.
- Owners and admins can invite; staff and managers cannot.
