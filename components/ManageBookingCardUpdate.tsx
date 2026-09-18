"use client";
import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

type Setup = { clientSecret: string; connectedAccount: string; publishableKey: string };
function CardForm({ token, onCancel, onSaved }: { token: string; onCancel: () => void; onSaved: (message: string) => void }) {
  const stripe = useStripe(); const elements = useElements(); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  return <form className="manage-booking-card-form" onSubmit={async event => {
    event.preventDefault(); if (!stripe || !elements || saving) return; setSaving(true); setError("");
    const result = await stripe.confirmSetup({ elements, redirect: "if_required" });
    if (result.error || !result.setupIntent) { setError(result.error?.message ?? "We couldn't update the payment method right now."); setSaving(false); return; }
    const response = await fetch(`/api/manage-booking/${token}/setup-intent/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ setupIntentId: result.setupIntent.id }) });
    const data = await response.json(); setSaving(false);
    if (!data.ok) { setError(data.error ?? "We couldn't update the payment method right now."); return; }
    onSaved(`Payment method updated. This card will be used for your scheduled balance payment.${data.brand && data.last4 ? ` ${String(data.brand).replace(/^./, char => char.toUpperCase())} •••• ${data.last4}` : ""}`);
  }}>
    <p>Enter the card you&apos;d like us to use for the scheduled balance payment.</p>
    <PaymentElement/>
    <div className="manage-booking-card-actions"><button className="button" disabled={!stripe || saving}>{saving ? "Saving..." : "Save new card"}</button><button className="button secondary small" type="button" disabled={saving} onClick={onCancel}>Cancel</button></div>
    {error && <p role="alert">{error}</p>}
  </form>;
}
export function ManageBookingCardUpdate({ token }: { token: string }) {
  const [setup, setSetup] = useState<Setup | null>(null); const [opening, setOpening] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const open = async () => {
    if (opening) return; setOpening(true); setError(""); setSuccess("");
    const response = await fetch(`/api/manage-booking/${token}/setup-intent`, { method: "POST" }); const data = await response.json(); setOpening(false);
    if (!data.clientSecret) { setError(data.error ?? "We couldn't open a secure card form right now."); return; }
    setSetup(data);
  };
  return <div className="manage-booking-card-update">
    <button className="button secondary" type="button" disabled={opening} onClick={open}>{opening ? "Opening secure card form..." : "Change card for scheduled payment"}</button>
    {setup && <Elements stripe={loadStripe(setup.publishableKey, { stripeAccount: setup.connectedAccount })} options={{ clientSecret: setup.clientSecret }}><CardForm token={token} onCancel={() => setSetup(null)} onSaved={message => { setSetup(null); setSuccess(message); }}/></Elements>}
    {error && <p role="alert">{error}</p>}{success && <p role="status">{success}</p>}
  </div>;
}
