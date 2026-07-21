"use client";

import { useMemo, useState } from "react";

type InventoryItem = {
  id: string;
  name: string;
  description: string | null;
  daily_price_cents: number;
  image_url: string | null;
  allow_quantity: boolean;
  stock_quantity: number;
};

type CapacityMap = Record<string, Record<string, number>>;
type SortOption = "featured" | "price-low" | "price-high" | "name";

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function BookingClient({
  inventory,
  capacityByItem,
  initialQuantities,
}: {
  inventory: InventoryItem[];
  capacityByItem: CapacityMap;
  initialQuantities: Record<string, number>;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>(initialQuantities);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("featured");
  const [viewDate, setViewDate] = useState(() => {
    const date = new Date();
    date.setDate(1);
    return date;
  });
  const [selectedDate, setSelectedDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedItems = useMemo(
    () => inventory.filter((item) => (quantities[item.id] ?? 0) > 0),
    [inventory, quantities]
  );

  const selectedUnitCount = selectedItems.reduce((sum, item) => sum + (quantities[item.id] ?? 0), 0);

  const visibleInventory = useMemo(() => {
    const term = search.trim().toLowerCase();
    const items = inventory.filter((item) =>
      !term || `${item.name} ${item.description ?? ""}`.toLowerCase().includes(term)
    );
    return [...items].sort((a, b) => {
      if (sort === "price-low") return a.daily_price_cents - b.daily_price_cents;
      if (sort === "price-high") return b.daily_price_cents - a.daily_price_cents;
      if (sort === "name") return a.name.localeCompare(b.name);
      return inventory.indexOf(a) - inventory.indexOf(b);
    });
  }, [inventory, search, sort]);

  function availableForDate(item: InventoryItem, date = selectedDate) {
    if (!date) return item.stock_quantity;
    return capacityByItem[item.id]?.[date] ?? item.stock_quantity;
  }

  function selectionFitsDate(date: string) {
    return selectedItems.every((item) => (quantities[item.id] ?? 0) <= availableForDate(item, date));
  }

  const total = selectedItems.reduce(
    (sum, item) => sum + item.daily_price_cents * (quantities[item.id] ?? 0),
    0
  );
  const deposit = Math.round(total * 0.25);
  const balance = total - deposit;

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();

  function isPast(day: number) {
    const d = new Date(year, month, day);
    d.setHours(23, 59, 59, 999);
    return d < new Date();
  }

  function setItemQuantity(item: InventoryItem, nextQuantity: number) {
    const max = item.allow_quantity ? availableForDate(item) : 1;
    const safe = Math.max(0, Math.min(Math.floor(nextQuantity), max));
    setQuantities((current) => {
      const next = { ...current };
      if (safe === 0) delete next[item.id];
      else next[item.id] = safe;
      return next;
    });
  }

  function chooseDate(date: string) {
    setSelectedDate(date);
    setQuantities((current) => {
      const next = { ...current };
      for (const item of inventory) {
        const quantity = next[item.id] ?? 0;
        if (quantity === 0) continue;
        const available = capacityByItem[item.id]?.[date] ?? item.stock_quantity;
        if (available === 0) delete next[item.id];
        else if (quantity > available) next[item.id] = available;
      }
      return next;
    });
  }

  async function submit(formData: FormData) {
    const items = selectedItems.map((item) => ({
      inventoryItemId: item.id,
      quantity: quantities[item.id],
    }));
    if (items.length === 0) return alert("Choose at least one rental item.");
    if (!selectedDate || !selectionFitsDate(selectedDate)) return alert("Please choose an available date.");

    setSubmitting(true);
    try {
      const payload = { ...Object.fromEntries(formData.entries()), items };
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start secure checkout.");
      if (!data.url) throw new Error("Stripe did not return a checkout link.");
      window.location.assign(data.url);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  const prettyDate = selectedDate
    ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      })
    : "";

  return (
    <div>
      <section className="booking-items-section">
        <div className="catalog-heading">
          <div>
            <span className="eyebrow">Party rental catalog</span>
            <h1 className="booking-title">Find the perfect setup.</h1>
            <p className="lead">Choose one-of-a-kind inflatables or add the exact number of tables, chairs, and add-ons you need.</p>
          </div>
          <div className="catalog-count">{inventory.length} rental{inventory.length === 1 ? "" : "s"}</div>
        </div>

        <div className="catalog-toolbar" aria-label="Product filters">
          <label className="catalog-search"><span>Search rentals</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Bounce house, tables, chairs..." /></label>
          <label className="catalog-sort"><span>Sort by</span><select value={sort} onChange={(e) => setSort(e.target.value as SortOption)}><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name: A to Z</option></select></label>
        </div>

        {selectedDate && <div className="availability-banner">Showing availability for <strong>{prettyDate}</strong>. Quantities reflect what remains available.<button type="button" onClick={() => setSelectedDate("")}>Clear date</button></div>}

        {visibleInventory.length > 0 ? (
          <div className="inventory-gallery">
            {visibleInventory.map((item) => {
              const quantity = quantities[item.id] ?? 0;
              const available = availableForDate(item);
              const unavailable = available === 0;
              return (
                <article className={`inventory-card ${quantity > 0 ? "selected" : ""} ${unavailable ? "unavailable" : ""}`} key={item.id}>
                  <div className="inventory-media">
                    {item.image_url ? <img src={item.image_url} alt={item.name} /> : <div className="inventory-image-placeholder">Photo coming soon</div>}
                    {quantity > 0 && <span className="selected-badge">{quantity} added</span>}
                    {unavailable && <span className="unavailable-badge">Unavailable</span>}
                  </div>
                  <div className="inventory-card-body">
                    <div className="inventory-card-head"><h3>{item.name}</h3><strong className="catalog-price">{money(item.daily_price_cents)}{item.allow_quantity ? " each" : ""}</strong></div>
                    {item.description && <p className="muted catalog-description">{item.description}</p>}
                    {item.allow_quantity ? (
                      <div className="quantity-picker" aria-label={`${item.name} quantity`}>
                        <button type="button" onClick={() => setItemQuantity(item, quantity - 1)} disabled={quantity === 0}>−</button>
                        <div><strong>{quantity}</strong><span>{selectedDate ? `${available} available` : `${item.stock_quantity} in inventory`}</span></div>
                        <button type="button" onClick={() => setItemQuantity(item, quantity + 1)} disabled={quantity >= available}>+</button>
                      </div>
                    ) : (
                      <button type="button" className={`catalog-add-button ${quantity ? "selected" : ""}`} onClick={() => setItemQuantity(item, quantity ? 0 : 1)} disabled={unavailable}>{quantity ? "✓ Added to reservation" : unavailable ? "Unavailable on this date" : "+ Add to reservation"}</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="empty-catalog"><h3>No rentals match your search.</h3><button type="button" onClick={() => setSearch("")}>Clear search</button></div>}
      </section>

      <div className={`selection-bar ${selectedItems.length ? "visible" : ""}`}><div><strong>{selectedUnitCount} unit{selectedUnitCount === 1 ? "" : "s"} selected</strong><span>{money(total)} rental total</span></div><button type="button" onClick={() => document.getElementById("reservation-details")?.scrollIntoView({ behavior: "smooth" })}>Choose date & continue</button></div>

      <div className="booking-shell" id="reservation-details">
        <div>
          <span className="eyebrow">Step 2 · Choose your date</span><h2>One date for your entire package.</h2><p className="muted">Green dates have enough remaining inventory for every selected quantity.</p>
          {selectedItems.length === 0 && <div className="notice">Add at least one rental above to see available dates.</div>}
          <div className="legend"><span><i className="dot available" />Available</span><span><i className="dot booked" />Unavailable</span><span><i className="dot selected" />Selected</span></div>
          <div className="calendar">
            <div className="calendar-head"><button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))}>‹</button><h3>{viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h3><button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))}>›</button></div>
            <div className="weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d}>{d}</span>)}</div>
            <div className="days">
              {Array.from({ length: firstDay }).map((_, i) => <button className="day blank" disabled key={`blank-${i}`} />)}
              {Array.from({ length: count }).map((_, i) => {
                const day = i + 1;
                const iso = isoDate(year, month, day);
                const unavailable = selectedItems.length === 0 || !selectionFitsDate(iso);
                const past = isPast(day);
                const classes = ["day", unavailable ? "booked" : "", past ? "past" : "", selectedDate === iso ? "selected" : ""].filter(Boolean).join(" ");
                return <button type="button" key={iso} className={classes} disabled={unavailable || past} onClick={() => chooseDate(iso)}>{day}</button>;
              })}
            </div>
          </div>
        </div>

        <form className="form-card" action={submit}>
          <span className="eyebrow">Step 3 · Checkout</span><h3>Complete your reservation</h3><div className="notice">{selectedDate ? `${prettyDate} selected` : "Select an available date to continue."}</div>
          <div className="selected-summary">
            <strong>{selectedUnitCount} unit{selectedUnitCount === 1 ? "" : "s"} selected</strong>
            {selectedItems.map((item) => <div className="summary-line" key={item.id}><span>{item.name} × {quantities[item.id]}</span><span>{money(item.daily_price_cents * quantities[item.id])}</span></div>)}
            <div className="summary-total"><span>Rental total</span><strong>{money(total)}</strong></div><div className="summary-line"><span>25% deposit due now</span><strong>{money(deposit)}</strong></div><div className="summary-line"><span>Remaining balance</span><strong>{money(balance)}</strong></div>
          </div>
          <input type="hidden" name="rentalDate" value={selectedDate} />
          <div className="form-grid"><label>First name<input name="firstName" required /></label><label>Last name<input name="lastName" required /></label><label>Email<input name="email" type="email" required /></label><label>Phone<input name="phone" type="tel" required /></label><label>Event start time<input name="startTime" type="time" required /></label><label>Event end time<input name="endTime" type="time" required /></label></div>
          <label>Delivery address<input name="address" required /></label><div className="form-grid"><label>City<select name="city" required defaultValue=""><option value="" disabled>Select city</option><option>Gilbert</option><option>Chandler</option><option>Mesa</option></select></label><label>ZIP code<input name="zipCode" required /></label></div>
          <label>Event notes<textarea name="notes" rows={4} placeholder="Gate code, surface type, party details, or other notes" /></label>
          <label><span><input type="checkbox" name="agreementAccepted" value="true" required className="inline-checkbox" />I agree to the rental agreement and safety rules.</span></label><label><span><input type="checkbox" name="depositAccepted" value="true" required className="inline-checkbox" />I understand the 25% reservation deposit is non-refundable and the remaining balance is still due under the rental agreement.</span></label>
          <button className="button" type="submit" disabled={!selectedDate || selectedItems.length === 0 || submitting}>{submitting ? "Opening secure checkout..." : `Pay ${money(deposit)} deposit`}</button><p className="muted checkout-note">Secure payment is processed by Stripe. Your reservation is confirmed only after payment succeeds.</p>
        </form>
      </div>
    </div>
  );
}
