# Epic 8, Checkpoint 1: Workforce Domain

## Domain boundaries

- `employees` is the tenant-owned workforce identity. An employee can exist without a login.
- `business_members` controls workspace authentication and authorization. It does not define the employee's operational roles.
- `workforce_roles` contains tenant-extensible operating roles. Default roles are seeded as starting points, not enforced industry types.
- `employee_role_assignments` preserves effective-dated, simultaneous role history.
- `technician_profiles` remains the source of technician operational settings and may link to an employee through `employee_id`.

Accepting a workspace invitation creates the `business_members` row through the existing invitation flow. A database trigger then creates or links the corresponding employee and records the workspace-derived workforce role. This keeps invitation behavior compatible while avoiding a requirement that every employee have an account.

## Tenant isolation

Every workforce row includes `business_id`. Composite foreign keys prevent role or technician links across businesses. RLS permits owner, administrator, and manager reads; only owners and administrators can mutate employee profiles and roles. Server actions also derive the business from the authenticated workspace and include the business ID in every mutation.

## Lifecycle

Deactivation sets a termination date and preserves the employee and role history. Reactivation clears the termination date. Role changes end old assignment records and create new records rather than rewriting historical meaning.

## Migration

Run:

```sh
supabase db push
```

If applying through the Supabase SQL editor, execute:

`supabase/migrations/20260726000100_epic_8_checkpoint_1_workforce_domain.sql`

Then verify:

```sql
select count(*) as employees_without_business
from public.employees
where business_id is null;

select count(*) as cross_tenant_roles
from public.employee_role_assignments era
left join public.employees e
  on e.business_id = era.business_id and e.id = era.employee_id
left join public.workforce_roles wr
  on wr.business_id = era.business_id and wr.id = era.workforce_role_id
where e.id is null or wr.id is null;

select business_id, auth_user_id, count(*)
from public.employees
where auth_user_id is not null
group by business_id, auth_user_id
having count(*) > 1;
```

All three queries should return zero problem rows.

## Deferred by design

Working hours, leave, skills, certifications, territories, assets, workforce metrics, and performance snapshots belong to later Epic 8 checkpoints. The optional photo field currently accepts an HTTPS reference; a tenant-scoped upload flow can be added later without changing the employee model.
