"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { InventoryItem } from "@/lib/inventory";

function dollars(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function categoryFor(item: InventoryItem) {
  const text = `${item.name} ${item.description ?? ""}`.toLowerCase();
  if (text.includes("water") || text.includes("wet") || text.includes("splash")) return "Water Slides";
  if (text.includes("obstacle")) return "Obstacle Courses";
  if (text.includes("combo")) return "Combos";
  if (text.includes("toddler")) return "Toddler";
  if (text.includes("slide")) return "Dry Slides";
  return "Bounce Houses";
}

export default function HomeCatalog({ inventory }: { inventory: InventoryItem[] }) {
  const [category, setCategory] = useState("All Rentals");
  const [sort, setSort] = useState("featured");

  const categories = useMemo(() => ["All Rentals", ...Array.from(new Set(inventory.map(categoryFor)))], [inventory]);
  const items = useMemo(() => {
    const filtered = category === "All Rentals" ? inventory : inventory.filter((item) => categoryFor(item) === category);
    return [...filtered].sort((a, b) => {
      if (sort === "low") return a.daily_price_cents - b.daily_price_cents;
      if (sort === "high") return b.daily_price_cents - a.daily_price_cents;
      if (sort === "name") return a.name.localeCompare(b.name);
      return 0;
    });
  }, [inventory, category, sort]);

  return (
    <>
      <div className="shop-toolbar">
        <div className="category-pills" aria-label="Rental categories">
          {categories.map((name) => (
            <button key={name} className={category === name ? "active" : ""} onClick={() => setCategory(name)}>{name}</button>
          ))}
        </div>
        <label className="sort-control">
          <span>Sort by</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="featured">Featured</option>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      {items.length === 0 ? (
        <div className="empty-catalog"><h3>New rentals are on the way</h3><p>Check back soon or view the booking page for current availability.</p></div>
      ) : (
        <div className="store-grid">
          {items.map((item, index) => (
            <article className="store-card" key={item.id}>
              <div className="store-media">
                {item.image_url ? <img src={item.image_url} alt={item.name} /> : <div className="store-placeholder">Photo coming soon</div>}
                {index === 0 && category === "All Rentals" ? <span className="popular-badge">Popular</span> : null}
              </div>
              <div className="store-card-body">
                <span className="item-category">{categoryFor(item)}</span>
                <div className="store-card-title"><h3>{item.name}</h3><strong>{dollars(item.daily_price_cents)}</strong></div>
                <p>{item.description || "A clean, exciting rental ready to make your event memorable."}</p>
                <div className="store-meta"><span>Full-day rental</span><span>Professional setup</span></div>
                <Link className="button store-button" href={`/book?item=${item.id}`}>Check Availability</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
