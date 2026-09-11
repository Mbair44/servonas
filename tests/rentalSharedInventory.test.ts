import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {
  availableListingQuantity,
  sharedInventoryCartConflict,
  sharedInventoryConflictMessage,
  type RentalListingWithRequirements,
} from "../lib/rentalSharedInventory.ts";

const pieceA: RentalListingWithRequirements = {
  id: "listing-a",
  name: "Piece A",
  required_inventory: [{inventoryItemId: "unit-a", quantityRequired: 1}],
};
const pieceB: RentalListingWithRequirements = {
  id: "listing-b",
  name: "Piece B",
  required_inventory: [{inventoryItemId: "unit-b", quantityRequired: 1}],
};
const combo: RentalListingWithRequirements = {
  id: "listing-combo",
  name: "Combo C",
  required_inventory: [
    {inventoryItemId: "unit-a", quantityRequired: 1},
    {inventoryItemId: "unit-b", quantityRequired: 1},
  ],
};

const availability = (unitA: number, unitB: number) => ({"unit-a": unitA, "unit-b": unitB});

test("booking A blocks A and Combo while B remains available", () => {
  const remaining = availability(0, 1);
  assert.equal(availableListingQuantity(pieceA, remaining), 0);
  assert.equal(availableListingQuantity(pieceB, remaining), 1);
  assert.equal(availableListingQuantity(combo, remaining), 0);
});

test("booking B blocks B and Combo while A remains available", () => {
  const remaining = availability(1, 0);
  assert.equal(availableListingQuantity(pieceA, remaining), 1);
  assert.equal(availableListingQuantity(pieceB, remaining), 0);
  assert.equal(availableListingQuantity(combo, remaining), 0);
});

test("booking Combo reserves both physical units", () => {
  const remaining = availability(0, 0);
  assert.equal(availableListingQuantity(pieceA, remaining), 0);
  assert.equal(availableListingQuantity(pieceB, remaining), 0);
  assert.equal(availableListingQuantity(combo, remaining), 0);
});

test("cancelling Combo releases both physical units", () => {
  const remaining = availability(1, 1);
  assert.equal(availableListingQuantity(pieceA, remaining), 1);
  assert.equal(availableListingQuantity(pieceB, remaining), 1);
  assert.equal(availableListingQuantity(combo, remaining), 1);
});

test("A and Combo cannot be checked out in the same cart", () => {
  const conflict = sharedInventoryCartConflict([pieceA, pieceB, combo], {"listing-a": 1, "listing-combo": 1});
  assert.deepEqual(conflict, {first: pieceA, second: combo});
  assert.equal(sharedInventoryConflictMessage, "These rentals use some of the same equipment. Please choose either the combo or the individual item.");
});

test("booking transaction locks shared units and snapshots reservations atomically", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260911000200_shared_rental_inventory.sql", import.meta.url), "utf8");
  assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(v_resource\.id::text,0\)\)/);
  assert.match(migration, /already reserved for that rental period/);
  assert.match(migration, /insert into public\.booking_inventory_reservations/);
  assert.match(migration, /booking\.status in\('pending_payment','paid','confirmed'\)/);
});

test("cancellation and break-even accounting use the shared reservation lifecycle", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20260911000200_shared_rental_inventory.sql", import.meta.url), "utf8");
  assert.match(migration, /release_rental_inventory_for_canceled_job/);
  assert.match(migration, /update public\.bookings set status='cancelled'/);
  assert.match(migration, /revenue_allocation_weight\/nullif\(sum\(reservation\.revenue_allocation_weight\)/);
  assert.match(migration, /count\(distinct booking_id\)/);
});

test("inventory editor exposes Included inventory mapping", async () => {
  const page = await readFile(new URL("../app/app/[businessSlug]/rental-inventory/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Included inventory/);
  assert.match(page, /Choose the physical items required for this rental/);
  assert.match(page, /saveRentalInventoryRequirements/);
});
