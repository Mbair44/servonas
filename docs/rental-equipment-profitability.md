# Rental equipment profitability

Apply `20260930000100_rental_equipment_profitability.sql` before deploying the new UI. It is additive and performs no booking backfill, financial recalculation, cash-expense insert, invoice change, or Stripe operation.

## Existing architecture and scope

- Inventory already stores `purchase_cost_cents`. The new `acquisition_cost_cents` is a generated alias, not a second editable price.
- `booking_items` contains sale lines; `rental_listing_inventory_requirements` and `booking_inventory_reservations` identify the actual included physical resources and quantities. A combo listing must not charge equipment cost again for itself if it reserves separate resources.
- `rental_inventory_performance` apportions final rental sale revenue by gross booking-line weight, then resource reservation weight. Its calculations and old historical figures remain unchanged. The existing card is explicitly labeled revenue recovery, not contribution profit.
- No rental contribution-profit ledger, payroll/vehicle cost ledger, or overhead allocation was found. Invoice lines have internal unit-cost estimates, not verified actual costs. The new job review captures actual labor, vehicle/delivery, processing fees, and other variable costs exactly once. The invoice estimate saved at completion is a reference for that review, not an additional automatic subtraction. Existing cash revenue, discounts, invoicing, payment, and estimate-margin calculations are unchanged.

## Inventory assumptions

Purchase cost and resale value describe the full inventory stock group, consistent with the prior group-level purchase-cost report. Expected lifetime rentals describes each physical unit. Cost per reserved unit rental is `(purchase cost - resale value) / (expected lifetime rentals * stock quantity)`. Multiply by actual reserved quantity and round to integer cents once per resource/booking. For stock=1, $3,000 / 100 rentals is $30. Group cost $6,000 for two units with 100 rentals each also yields $30 per reserved unit. Changing stock or assumptions affects future snapshots only.

Tracking is off by default. Disabled resources explicitly allocate zero. Enabled resources with missing purchase cost/lifetime have unknown allocation, not zero; fully loaded profit is unavailable for those snapshots. Zero purchase cost is valid. Resale cannot exceed purchase cost. Usage may exceed expected life, and remaining life is clamped at zero; nothing blocks rentals or caps subsequent allocations.

## Completion and immutable history

A job transition to completed captures eligible bookings, or the first paid/confirmed transition captures a booking whose job is already completed. Eligibility requires a positive recorded payment, an active paid/confirmed/completed booking, a completed nondeleted job, and `is_test_booking=false`. Canceled/expired/pending/refunded bookings and canceled lines do not contribute. Physical reserved quantities—not distinct bookings—count toward unit lifetime.

`booking_profitability_snapshots` freezes net booking revenue and equipment assumptions at that transition. `booking_equipment_allocations` records resource quantities, revenue weights, and costs. No read, inventory edit, or unchanged paid-status update creates a historical backfill. Existing completed rentals count toward usage but have no invented historic profit; coverage is shown explicitly. Cost review is a one-time, permission-checked update that cannot replace already reviewed costs. Later refunds or corrections do not restate frozen profit; reports exclude subsequently canceled/refunded/test bookings while retaining their snapshots. A future explicit adjustment workflow would be needed for restatements.

Net booking revenue includes delivery/operator charges but excludes tax; discounts are already in the authoritative booking total. Refunds known at snapshot time reduce revenue in proportion to its share of the total (no separate refund tax breakdown exists here). Resource rental revenue excludes delivery, operator charges, and tax, following the existing inventory report's basis. All booking contribution is apportioned using the existing line/resource weights. Cumulative rounding guarantees the item sums reconcile exactly, including uneven cents. Zero-price groups use equal resource shares, explicitly snapshotted through revenue weights.

## Reports and cost review

Rental Inventory gains cost fields, a live preview, equipment/life progress, contribution recovery, and sorts for lifetime revenue, reviewed contribution, reviewed fully loaded profit, and recovery. Existing lifetime revenue remains visible. New profit figures are labeled reviewed and show historical/tracked/reviewed coverage; they are not claims of complete lifetime profit where cost evidence is absent.

Job Detail shows net booking revenue, reviewed operating costs, contribution profit/margin, allocated equipment cost, and fully loaded profit/margin. Finalizing costs creates no invoice, payment, expense, or charge. Margins use the existing `marginPercent` helper. There is no invented overhead cost.

Recovery uses purchase cost against reviewed contribution, not gross revenue. Remaining rentals to recovery uses average positive contribution per reviewed physical unit and requires at least three reviewed units. Negative/no contribution or insufficient evidence returns unavailable. This is a planning estimate based on reviewed data, not a guarantee.

New tables have tenant RLS; authenticated users can only read their owner/admin/manager workspace snapshots. Writes occur through completion triggers and the permission-checked finalization function. Service-role operations follow the existing application authorization boundary.

## Verification

Run PostgreSQL-backed tests with `PGLITE_TEST_ROOT` pointing to an installed PGlite package:

```
PGLITE_TEST_ROOT=/path/to/node_modules/@electric-sql/pglite node --test tests/rentalEquipmentProfitability*.test.ts
```

No production migration or customer payment is needed for these tests.
