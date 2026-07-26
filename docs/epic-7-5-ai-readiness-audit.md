# Epic 7.5 — AI Readiness and Future Platform Audit

## Executive assessment

Servonas has a healthy operational foundation and is ready to proceed to Epic 8
with minor, bounded improvements. It is not ready for autonomous scheduling or
enterprise-scale AI execution. The domain model is generally tenant-scoped,
auditable, and extensible, but historical facts, workforce normalization,
privileged execution boundaries, and analytical read models must mature before
Epics 9–10.

The brief states that Epic 7.1 is complete. Repository evidence does not support
that claim: route calculation and optimization still execute synchronously in a
request, and there is no durable work queue, lease, retry/backoff lifecycle, or
provider throttle. Epic 7.5 does not hide or implement around that release gate.

## Domain review

| Domain | Ready | Needs improvement | Future risk |
|---|---|---|---|
| Customers | Tenant-scoped identity, contact preferences, tags and locations | Consent history, lifecycle source, retention and merge history | Mutable customer attributes can reinterpret historical reports |
| Employees | Membership and technician profiles are separated | Normalize skills, certifications, availability, territories, vehicles and crews in Epic 8 | JSON/string capabilities become inconsistent |
| Routes | Versioned plans, provider metrics, compact geometry, stale state | Durable asynchronous calculation and provider-independent injection | Synchronous provider work and unbounded history |
| Route stops | Ordered, locked, time-windowed, duration-sourced | Identity snapshots added in this checkpoint; actual travel is still unavailable | Do not infer actual travel from estimated legs |
| Route legs | Road distance, duration, warnings and provider request IDs | Provider error taxonomy and traffic/model version | Provider estimates may be mistaken for measured facts |
| Dispatch | Manual control, concurrency and human-approved optimization | Bulk operations, decision context and async progress | Dense workflow at 20+ technicians |
| Scheduling | UTC persistence, local display, hours/windows and assignment synchronization | General constraint evaluation and resource-group assignments | Single-primary-technician assumptions |
| Service locations | Structured address, geocoding state/cache and coordinates | Territory/geography dimensions and merge history | Address edits can affect reports without snapshots |
| Notifications | Delivery ledger, consent/preference checks and idempotency | Durable queue and preference history | ETA messages must not claim live location |
| Reports | Estimated route reporting and clear units | Immutable fact projections, range limits and warehouse path | Current mutable job state can rewrite historical meaning |
| Audit events | Route lifecycle and actor coverage | Correct optimization-request semantics and non-cascading long-term retention | Current cascades are not compliance-grade immutability |
| Permissions | Strong tenant FKs, RLS and technician self-route scope | Real-database RLS tests and narrow service-role commands | Future workers could bypass caller authorization |
| Operating models | Routing is optional and derived from jobs | Generic visits/stops, paired pickup/delivery, crews and projects | Forcing rentals/projects into one service-job stop |

## Implemented minimal schema improvements

Migration `20260725000800_epic_7_5_decision_history_readiness.sql` adds:

1. `operational_decisions`: provider-neutral provenance, lifecycle, strategy,
   score, confidence, reasons, alternatives, structured explanation, immutable
   context, before/after metrics, override reason, actor and timestamps.
2. Assignment provenance: `assignment_source`, `assignment_reason`, and an
   optional tenant-bound operational decision reference. Existing assignments
   are explicitly `legacy`; future rows default to `manual`.
3. Historical route identity snapshots: technician display name on technician
   routes and job number/title, customer label, service label, and location
   label on route stops.
4. Tenant-scoped RLS, composite foreign keys, idempotency, and reporting indexes
   for operational decisions.

Backfilled route labels reflect current state at migration time and must not be
misrepresented as historically exact. New route calculations capture values at
calculation time.

## Historical fact strategy

Route records now preserve the main planned identity and estimate snapshots:
technician label, customer label, location label/address, service label, job
identity, stop order, planned arrival/departure, service duration and source,
provider road estimates, route version, travel mode and calculation timestamp.

Still required when real data becomes available:

- Actual departure and travel duration from an explicit trusted source.
- Actual driven distance distinguished from odometer mileage.
- Assignment facts for every assignment interval.
- Financial facts joined by stable geography and service dimensions.
- Callback/re-service facts.
- Snapshot/version identifiers for workforce qualifications and territories.

Transactional tables should remain authoritative for operations. Future BI
should consume immutable fact projections rather than repeatedly joining current
mutable rows.

## Explainability and AI learning

`operational_decisions` can answer who or what generated a decision, which
strategy ran, alternatives considered, structured reasons, score/confidence,
what context was known, who decided, whether it was accepted/modified/rejected,
and before/after estimated results.

Before AI scheduling, every recommendation producer must populate a versioned
context contract. Required reason categories should include eligibility,
skills/certifications, territory, capacity, appointment window, customer
preference, travel impact, commercial priority and uncertainty. Rejected
candidates and dispatcher override reasons must be retained—not only winners.

Do not store prompts, secrets, unrestricted customer notes, or unnecessary PII
in decision context. Store normalized inputs, producer/model version, policy
version and stable record identifiers.

## Workforce and operating-model recommendations

Epic 8 should normalize employee skills, certifications with expiration,
availability exceptions, territories, vehicles, equipment capabilities and crew
membership. Route requirements JSON should remain an extension envelope, not
the permanent source of truth.

Introduce a generic operational visit/stop only when required by an operating
model. It should support customer service, depot, pickup, delivery, break,
inspection and project visit without creating fake customer jobs. Preserve jobs
as business work and route stops as derived planning facts.

## Business intelligence readiness

Current data can support estimated route density, travel efficiency, collections
and basic technician/job measures. It cannot yet reliably answer profitability
by neighborhood, callbacks by technician, churn, or actual route waste without:

- Stable geography dimensions.
- Revenue/cost facts by job and location.
- Callback/re-service classification.
- Assignment intervals and workforce snapshots.
- Actual operational timestamps and travel evidence.
- Customer lifecycle and retention events.

Indexes should follow proven query shapes. The new decision indexes cover tenant
timeline, job, route plan and source/outcome analysis. Do not add speculative
indexes for natural-language questions before an analytical read model exists.

## Onboarding and progressive complexity

Business modules, optional routing records, inherited endpoint defaults, fallback
durations and deferred provider configuration support progressive setup.
Self-service onboarding still needs import provenance, mapping version, source
row identifier, validation outcome, configuration recommendation lifecycle and
reversible import batches.

Defaults must remain usable for appointment businesses that do not need routing.
Territories, vehicles, certifications and advanced optimization should activate
only when the operating model requires them.

## Privacy and privileged execution

Tenant composite keys and RLS are strong. Private technician origins are
protected from general queries. Operational decisions may contain sensitive
workforce reasoning, so office-only RLS is appropriate; technician or customer
explanations should later be produced through deliberately redacted views.

Service-role route operations remain a high-priority boundary risk. Future
workers must accept narrow signed commands, resolve the tenant from stored work,
re-check authorization for user-initiated commands, and log actor, tenant,
operation and result without addresses, secrets or private origin data.

## Prioritized technical debt

### Critical

- Complete Epic 7.1 with a durable route-work queue, leases, retry/backoff,
  cancellation, timeout recovery, throttling and idempotent workers.
- Run real Supabase RLS isolation and clean-migration rehearsals.
- Establish immutable analytical facts before claiming historical BI accuracy.

### High

- Narrow and test all service-role operations.
- Normalize workforce qualifications, territories and availability in Epic 8.
- Connect operational decisions to assignment and optimization application paths.
- Retain rejected alternatives and override reasons.
- Correct route-audit optimization-request semantics and long-term retention.
- Add provider quota, cost, failure and latency monitoring.

### Medium

- Add provider injection/capability discovery and route-matrix screening.
- Build a bounded dispatch read model and reporting projections.
- Add generic operational visits when rentals/projects require them.
- Version import mappings, business configuration and decision context schemas.

### Low

- Improve dispatcher status language, saved views and remediation links.
- Add optional richer explanation presentation after the data is trustworthy.

## Future epic readiness

| Epic | Score | Assessment |
|---|---:|---|
| Epic 8 — Technician & Workforce Management | 8/10 | Ready. Normalize workforce capabilities rather than expanding routing JSON. |
| Epic 9 — AI Scheduling & Territory Intelligence | 6/10 | Decision schema is ready; async orchestration, territories and constraint facts are not. |
| Epic 10 — AI Business Intelligence | 5/10 | Operational data is rich, but immutable facts and analytical projections are missing. |
| Epic 11 — Customer Experience | 7/10 | Strong customer/location/communication base; preference and consent history need work. |
| Epic 17 — Workflow Engine & Industry Profiles | 6/10 | Optional modules help, but generic visits and versioned operating-model configuration are needed. |
| Epic 18 — Self-Service AI Onboarding | 5/10 | Defaults are promising; reversible import batches and mapping/configuration provenance are absent. |

## Final recommendation

**⚠ Ready with minor improvements for Epic 8.**

Proceed to workforce management because it supplies the normalized skills,
certifications, availability, territory and vehicle data future scheduling
requires. Do not start autonomous scheduling or AI BI until the Critical Epic
7.1 items and immutable fact strategy are complete.

After this audit, use a short Architecture Alignment Check at the start of each
epic and a Production Readiness Review at its end rather than repeating broad
platform audits.
