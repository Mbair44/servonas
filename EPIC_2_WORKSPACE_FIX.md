# Epic 2 workspace access fix

If business creation succeeds but `/app/[businessSlug]` returns a 404, run:

```text
supabase/epic_2_workspace_access_fix.sql
```

The original membership RLS policy referenced `business_members` from inside a policy on `business_members`. PostgreSQL can treat that as recursive policy evaluation, preventing the workspace query from resolving.

After running the migration, open `/app`. Your existing company should appear there. Do not create the company again.
