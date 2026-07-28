# Epic 2.4 access-check migration

Product mutations now use the centralized capability evaluator:

| Domain | Capability |
| --- | --- |
| Guided onboarding and business profile | `business_onboarding` |
| Team roles and technician activation | `team_management` |
| Employee imports | `employee_import` |
| Employee invitations | `employee_invitations` |
| Customers | `customer_management` |
| Customer migration and worker | `customer_migration` |
| Jobs | `job_management` |
| Schedule | `schedule_management` |
| Dispatch and routing policy | `dispatch` |
| Territories | `territory_management` |
| Scenario planning | `scenario_planning` |
| Estimates and price book | `estimates` |
| Invoices and Stripe Connect configuration | `invoices` |
| Public booking configuration and submission | `online_booking` |

Existing role checks remain authoritative for the individual user. Public
booking uses the tenant capability without requiring customer membership.
Background import execution rechecks capability before processing.

Stripe webhook, Connect readiness, invoice checkout readiness, payment status,
feature release state, customer lifecycle state, and employee lifecycle state
were intentionally not converted into entitlement concepts.
