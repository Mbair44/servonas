"use client";

import { useState, type FormEvent } from "react";

type InventoryItem = { id: string; name: string };
type BlockedDate = {
  id: string;
  blocked_date: string;
  reason: string | null;
  inventory_items: { name: string } | { name: string }[] | null;
};

function itemName(row: BlockedDate) {
  if (Array.isArray(row.inventory_items)) return row.inventory_items[0]?.name ?? "Unknown item";
  return row.inventory_items?.name ?? "Unknown item";
}

export default function BlockedDatesManager({
  inventory,
  initialBlockedDates,
}: {
  inventory: InventoryItem[];
  initialBlockedDates: BlockedDate[];
}) {
  const [blockedDates, setBlockedDates] = useState(initialBlockedDates);
  const [adminKey, setAdminKey] = useState("");
  const [inventoryItemId, setInventoryItemId] = useState(inventory[0]?.id ?? "");
  const [blockedDate, setBlockedDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function addBlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/admin/blocked-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ inventoryItemId, blockedDate, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not block that date.");
      setBlockedDates((rows) => [...rows, data.blockedDate].sort((a, b) => a.blocked_date.localeCompare(b.blocked_date)));
      setBlockedDate("");
      setReason("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not block that date.");
    } finally {
      setBusy(false);
    }
  }

  async function removeBlock(id: string) {
    if (!confirm("Remove this blocked date?")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/blocked-dates?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove the blocked date.");
      setBlockedDates((rows) => rows.filter((row) => row.id !== id));
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not remove the blocked date.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="blocked-date-manager">
      <div className="notice">
        Enter the private admin key stored in Vercel as <code>ADMIN_ACCESS_KEY</code>. It is sent only when you add or remove a block.
      </div>
      <form onSubmit={addBlock} className="block-date-form">
        <label>Admin key<input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} required /></label>
        <label>Rental item
          <select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)} required>
            {inventory.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Date<input type="date" value={blockedDate} onChange={(e) => setBlockedDate(e.target.value)} required /></label>
        <label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Maintenance, personal use, weather, etc." /></label>
        <button className="button small" disabled={busy || !inventoryItemId}>{busy ? "Saving..." : "Block date"}</button>
      </form>

      <div className="admin-list block-list">
        {blockedDates.length === 0 ? <p className="muted">No upcoming blocked dates.</p> : blockedDates.map((row) => (
          <div className="admin-list-row" key={row.id}>
            <div><strong>{row.blocked_date}</strong><br /><span className="muted">{itemName(row)}{row.reason ? ` — ${row.reason}` : ""}</span></div>
            <button className="button secondary small" type="button" disabled={busy || !adminKey} onClick={() => removeBlock(row.id)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
