"use client";

import { useMemo, useState } from "react";

type RefundBooking = {
  id: string;
  booking_number: number;
  customer_name: string;
  rental_date: string;
  status: string;
  deposit_cents: number;
  refunded_cents: number;
  stripe_payment_intent_id: string | null;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function RefundManager({ initialBookings }: { initialBookings: RefundBooking[] }) {
  const [bookings, setBookings] = useState(initialBookings);
  const [adminKey, setAdminKey] = useState("");
  const [selectedId, setSelectedId] = useState(initialBookings[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [cancelBooking, setCancelBooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const selected = useMemo(() => bookings.find((booking) => booking.id === selectedId), [bookings, selectedId]);
  const refundable = selected ? Math.max(0, selected.deposit_cents - selected.refunded_cents) : 0;

  function setFullRefund() {
    setAmount((refundable / 100).toFixed(2));
    setCancelBooking(true);
  }

  async function submitRefund() {
    if (!selected) return;
    const amountCents = Math.round(Number(amount) * 100);
    if (!confirm(`Refund ${money(amountCents)} for reservation #${selected.booking_number}? This sends money back through Stripe.`)) return;

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ bookingId: selected.id, amountCents, reason, cancelBooking }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not issue the refund.");

      setBookings((current) => current.map((booking) => booking.id === selected.id ? {
        ...booking,
        refunded_cents: data.refundedCents,
        status: data.bookingStatus,
      } : booking));
      setAmount("");
      setReason("");
      setCancelBooking(false);
      setMessage(`Refund submitted to Stripe. Refund ID: ${data.refundId}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not issue the refund.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="refund-manager">
      <div className="notice">
        The 25% deposit is normally non-refundable. Use this only for approved exceptions. A full refund also releases the reserved inventory date.
      </div>
      <label>
        Admin key
        <input type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} />
      </label>
      {bookings.length === 0 ? <p className="muted">No paid bookings are available to refund.</p> : (
        <>
          <label>
            Reservation
            <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setAmount(""); setMessage(""); }}>
              {bookings.map((booking) => (
                <option value={booking.id} key={booking.id}>
                  #{booking.booking_number} — {booking.customer_name} — {booking.rental_date}
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <div className="refund-summary">
              <span>Deposit paid: <strong>{money(selected.deposit_cents)}</strong></span>
              <span>Already refunded: <strong>{money(selected.refunded_cents)}</strong></span>
              <span>Available to refund: <strong>{money(refundable)}</strong></span>
            </div>
          ) : null}
          <label>
            Refund amount
            <div className="price-input-wrap">
              <span>$</span>
              <input type="number" min="0.01" step="0.01" max={(refundable / 100).toFixed(2)} value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
          </label>
          <button className="button secondary small" type="button" onClick={setFullRefund} disabled={!refundable}>Use full refundable amount</button>
          <label>
            Reason
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Equipment unavailable, weather exception, billing correction..." />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={cancelBooking} onChange={(event) => setCancelBooking(event.target.checked)} />
            Cancel the reservation and release its inventory date
          </label>
          <button className="button danger small" type="button" onClick={submitRefund} disabled={busy || !adminKey || !amount || refundable <= 0}>
            {busy ? "Processing refund..." : "Issue Stripe refund"}
          </button>
          {message ? <p className="success-message">{message}</p> : null}
        </>
      )}
    </div>
  );
}
