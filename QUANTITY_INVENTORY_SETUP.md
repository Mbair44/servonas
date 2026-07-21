# Quantity-based inventory setup

This version lets customers choose quantities for shared inventory such as chairs, tables, linens, and add-ons while keeping inflatables as single-select rentals.

## 1. Run the migration

Open Supabase → SQL Editor and run:

```text
supabase/quantity_based_inventory.sql
```

This adds:

- `allow_quantity` to inventory items
- `stock_quantity` to inventory items
- quantity-aware availability
- transactional protection against overselling
- a new quantity-aware booking function

Existing inventory defaults to single-select with one unit, so current inflatables remain safe.

## 2. Configure inventory

Open `/admin#inventory`, enter the admin key, and edit each product.

Examples:

- Bounce house: quantity selection off, stock 1
- Six-foot table: quantity selection on, stock 12
- White folding chair: quantity selection on, stock 80

Prices are per unit per rental day.

## 3. Deploy

Commit and push normally. No new environment variables are required.
