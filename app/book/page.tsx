import BookingClient from "@/components/BookingClient";
import { getInventoryCapacityUsage } from "@/lib/bookings";
import { getActiveInventory } from "@/lib/inventory";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ item?: string; items?: string; cart?: string }>;
};

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseInitialQuantities(value: string | undefined) {
  const result: Record<string, number> = {};
  for (const entry of (value ?? "").split(",")) {
    const [id, quantityText] = entry.split(":");
    const quantity = Number(quantityText ?? "1");
    if (id?.trim() && Number.isInteger(quantity) && quantity > 0) result[id.trim()] = quantity;
  }
  return result;
}

export default async function BookPage({ searchParams }: Props) {
  const params = await searchParams;
  const inventory = await getActiveInventory();

  if (inventory.length === 0) {
    return (
      <main className="section alt">
        <div className="container card">
          <h2>No active rental inventory was found.</h2>
          <p>Confirm that at least one inventory item is active in Supabase.</p>
        </div>
      </main>
    );
  }

  const requested = params.cart
    ? parseInitialQuantities(params.cart)
    : Object.fromEntries(
        (params.items ?? params.item ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => [id, 1])
      );

  const initialQuantities = Object.fromEntries(
    Object.entries(requested)
      .filter(([id]) => inventory.some((item) => item.id === id))
      .map(([id, quantity]) => {
        const item = inventory.find((row) => row.id === id)!;
        return [id, Math.min(item.allow_quantity ? quantity : 1, item.stock_quantity)];
      })
  );

  const start = new Date();
  start.setDate(1);
  const end = new Date(start.getFullYear(), start.getMonth() + 13, 0);

  const capacityResults = await Promise.all(
    inventory.map(async (item) => [
      item.id,
      await getInventoryCapacityUsage(item.id, iso(start), iso(end)),
    ] as const)
  );

  const capacityByItem = Object.fromEntries(
    capacityResults.map(([itemId, rows]) => [
      itemId,
      Object.fromEntries(rows.map((row) => [row.rental_date, row.available_quantity])),
    ])
  );

  return (
    <main className="section alt">
      <div className="container">
        <BookingClient
          inventory={inventory}
          capacityByItem={capacityByItem}
          initialQuantities={initialQuantities}
        />
      </div>
    </main>
  );
}
