# Epic 8, Checkpoint 3: Skills and Certifications

## Model

- `workforce_qualifications` is the tenant-owned, extensible catalog.
- Definitions are typed as `skill`, `certification`, or `license`.
- `employee_qualifications` preserves assignment history, credential metadata,
  issue and expiration dates, and revocation/supersession status.
- No qualification names are hardcoded. Examples such as EPA Certification or
  an electrical license are data entered by the business.

Active, non-expired qualification names are mirrored into the existing
`technician_profiles.skills` array for routing compatibility. Structured
workforce tables are authoritative; the array is not independently edited by
the new workflow.

## Tenant isolation

Every assignment uses composite tenant foreign keys to both the employee and
qualification definition. Owners and administrators write, managers read, and
employees with accounts can read only their own assignments plus their
business's definition catalog.

## Apply

```sh
supabase db push
```

Or execute:

`supabase/migrations/20260726000300_epic_8_checkpoint_3_workforce_qualifications.sql`

## Verify

```sql
select count(*) as cross_tenant_qualification_assignments
from public.employee_qualifications assignment
left join public.employees employee
  on employee.business_id=assignment.business_id
 and employee.id=assignment.employee_id
left join public.workforce_qualifications definition
  on definition.business_id=assignment.business_id
 and definition.id=assignment.qualification_id
where employee.id is null or definition.id is null;

select business_id,employee_id,qualification_id,count(*)
from public.employee_qualifications
where status='active'
group by business_id,employee_id,qualification_id
having count(*)>1;
```

Both queries should return zero problem rows.
