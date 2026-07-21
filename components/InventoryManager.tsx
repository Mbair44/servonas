"use client";

import { useMemo, useState, type FormEvent } from "react";

type InventoryItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  daily_price_cents: number;
  image_url: string | null;
  image_urls?: string[] | null;
  active: boolean;
  allow_quantity: boolean;
  stock_quantity: number;
};

type FormState = {
  name: string;
  description: string;
  imageUrl: string;
  imageUrls: string[];
  priceDollars: string;
  active: boolean;
  allowQuantity: boolean;
  stockQuantity: string;
};

const emptyForm: FormState = {
  name: "",
  description: "",
  imageUrl: "",
  imageUrls: [],
  priceDollars: "",
  active: true,
  allowQuantity: false,
  stockQuantity: "1",
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export default function InventoryManager({ initialInventory }: { initialInventory: InventoryItem[] }) {
  const [items, setItems] = useState(initialInventory);
  const [adminKey, setAdminKey] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  const editingItem = useMemo(
    () => items.find((item) => item.id === editingId) ?? null,
    [editingId, items]
  );

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function beginEdit(item: InventoryItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description ?? "",
      imageUrl: item.image_url ?? "",
      imageUrls: item.image_urls?.length ? item.image_urls : (item.image_url ? [item.image_url] : []),
      priceDollars: (item.daily_price_cents / 100).toFixed(2),
      active: item.active,
      allowQuantity: item.allow_quantity,
      stockQuantity: String(item.stock_quantity),
    });
    setMessage("");
    document.getElementById("inventory-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setMessage("");
  }


  async function uploadImages(files: FileList | null) {
    if (!files?.length) return;
    if (!adminKey) { alert("Enter your admin key before uploading images."); return; }
    setUploading(true);
    try {
      const payload = new FormData();
      Array.from(files).forEach((file) => payload.append("files", file));
      const response = await fetch("/api/admin/inventory-images", { method: "POST", headers: { "x-admin-key": adminKey }, body: payload });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not upload the images.");
      setForm((current) => {
        const imageUrls = [...current.imageUrls, ...data.urls].slice(0, 20);
        return { ...current, imageUrls, imageUrl: current.imageUrl || imageUrls[0] || "" };
      });
      setMessage(`${data.urls.length} image${data.urls.length === 1 ? "" : "s"} uploaded.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not upload the images.");
    } finally { setUploading(false); }
  }

  function makeCover(url: string) { setForm((current) => ({ ...current, imageUrl: url })); }
  function removeImage(url: string) {
    setForm((current) => {
      const imageUrls = current.imageUrls.filter((image) => image !== url);
      return { ...current, imageUrls, imageUrl: current.imageUrl === url ? (imageUrls[0] || "") : current.imageUrl };
    });
  }

  async function saveItem(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/inventory", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ id: editingId, ...form }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save the inventory item.");
      setItems((current) => editingId
        ? current.map((item) => (item.id === editingId ? data.item : item))
        : [...current, data.item]
      );
      setMessage(editingId ? "Inventory item updated." : "Inventory item added.");
      setEditingId(null);
      setForm(emptyForm);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save the inventory item.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: InventoryItem) {
    const warning = item.active
      ? `Delete ${item.name}? If it has booking history, it will be deactivated instead so past reservations remain intact.`
      : `Permanently delete ${item.name}? If it has booking history, it will remain safely archived.`;
    if (!confirm(warning)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/inventory?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete the inventory item.");
      if (data.archived) {
        setItems((current) => current.map((row) => (row.id === item.id ? { ...row, active: false } : row)));
        setMessage(data.message);
      } else {
        setItems((current) => current.filter((row) => row.id !== item.id));
        setMessage("Inventory item deleted.");
      }
      if (editingId === item.id) resetForm();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not delete the inventory item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inventory-manager">
      <div className="notice">Enter the private admin key stored in Vercel as <code>ADMIN_ACCESS_KEY</code>. Turn on quantity selection for shared stock such as tables, chairs, linens, and add-ons.</div>
      <label className="inventory-admin-key">Admin key<input type="password" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} required /></label>

      <form id="inventory-editor" className="inventory-form" onSubmit={saveItem}>
        <div className="admin-panel-header compact"><div><span className="eyebrow">{editingItem ? "Edit rental" : "New rental"}</span><h3>{editingItem ? editingItem.name : "Add inventory item"}</h3></div>{editingItem ? <button className="button secondary small" type="button" onClick={resetForm}>Cancel edit</button> : null}</div>
        <div className="inventory-form-grid">
          <label>Name<input value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="White Folding Chair" required /></label>
          <label>Price per unit/day<div className="price-input-wrap"><span>$</span><input type="number" min="0" step="0.01" value={form.priceDollars} onChange={(e) => updateForm("priceDollars", e.target.value)} placeholder="3.00" required /></div></label>
          <label>Units in inventory<input type="number" min="1" max="10000" step="1" value={form.stockQuantity} onChange={(e) => updateForm("stockQuantity", e.target.value)} required /></label>
          <label className="checkbox-row inventory-active-toggle"><input type="checkbox" checked={form.allowQuantity} onChange={(e) => updateForm("allowQuantity", e.target.checked)} />Let customers choose a quantity</label>
          <label className="inventory-form-wide">Description<textarea value={form.description} onChange={(e) => updateForm("description", e.target.value)} placeholder="Describe the rental, dimensions, capacity, and included setup." rows={3} /></label>
          <div className="inventory-form-wide image-upload-panel">
            <label>Rental photos<input className="image-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(e) => { uploadImages(e.target.files); e.currentTarget.value = ""; }} disabled={uploading || !adminKey} /></label>
            <p className="muted">Upload up to 10 photos at once. JPG, PNG, WebP, or GIF; maximum 8 MB each. Click a photo to make it the cover.</p>
            {uploading ? <p className="upload-status">Uploading photos…</p> : null}
            {form.imageUrls.length ? <div className="admin-image-grid">{form.imageUrls.map((url) => <div className={`admin-image-thumb ${form.imageUrl === url ? "cover" : ""}`} key={url}><button type="button" className="cover-image-button" onClick={() => makeCover(url)} title="Make cover image"><img src={url} alt="Rental upload preview" />{form.imageUrl === url ? <span>Cover</span> : <span>Use as cover</span>}</button><button type="button" className="remove-image-button" onClick={() => removeImage(url)} aria-label="Remove image">×</button></div>)}</div> : null}
          </div>
          <label className="checkbox-row inventory-active-toggle"><input type="checkbox" checked={form.active} onChange={(e) => updateForm("active", e.target.checked)} />Active and visible on the booking site</label>
        </div>
        <p className="muted">For inflatables, leave quantity selection off and inventory at 1. For chairs or tables, turn it on and enter your full stock count.</p>
        <button className="button small" disabled={busy || !adminKey}>{busy ? "Saving..." : editingItem ? "Save changes" : "Add inventory item"}</button>
        {message ? <p className="success-message">{message}</p> : null}
      </form>

      <div className="inventory-admin-grid">
        {items.length === 0 ? <p className="muted">No inventory items yet.</p> : items.map((item) => (
          <article className="inventory-admin-card" key={item.id}>
            {item.image_url ? <img src={item.image_url} alt={item.name} /> : <div className="inventory-image-placeholder">No image</div>}
            <div className="inventory-admin-card-body">
              <div className="inventory-card-title-row"><h3>{item.name}</h3><span className={`status ${item.active ? "paid" : "cancelled"}`}>{item.active ? "Active" : "Inactive"}</span></div>
              <strong className="inventory-price">{money(item.daily_price_cents)}{item.allow_quantity ? " each" : ""}</strong>
              <p className="inventory-stock-label">{item.stock_quantity} in inventory · {item.allow_quantity ? "Quantity selector on" : "Single-select item"}</p>
              <p className="muted">{item.description || "No description yet."}</p>
              <div className="inventory-card-actions"><button className="button secondary small" type="button" disabled={busy || !adminKey} onClick={() => beginEdit(item)}>Edit</button><button className="button danger small" type="button" disabled={busy || !adminKey} onClick={() => removeItem(item)}>Delete</button></div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
