"use client";
import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

function CardForm({ token }: { token: string }) {
  const stripe = useStripe(); const elements = useElements(); const [message, setMessage] = useState(""); const [saving, setSaving] = useState(false);
  return <form onSubmit={async event => {
    event.preventDefault(); if (!stripe || !elements) return; setSaving(true); setMessage("");
    const result = await stripe.confirmSetup({ elements, redirect: "if_required" });
    if (result.error || !result.setupIntent) { setMessage(result.error?.message ?? "We couldn't update the payment method right now."); setSaving(false); return; }
    const response = await fetch(`/api/manage-booking/${token}/setup-intent/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ setupIntentId: result.setupIntent.id }) });
    const data = await response.json(); setSaving(false);
    setMessage(data.ok ? `Payment method updated. This card will be used for your scheduled balance payment.${data.brand && data.last4 ? ` ${String(data.brand).replace(/^./, c => c.toUpperCase())} •••• ${data.last4}` : ""}` : (data.error ?? "We couldn't update the payment method right now."));
  }}><PaymentElement/><button className="button" disabled={!stripe || saving}>{saving ? "Saving…" : "Save card"}</button>{message && <p role="status">{message}</p>}</form>;
}
export function ManageBookingCardUpdate({ token }: { token: string }) {
  const [setup, setSetup] = useState<any>(null);
  return !setup ? <button className="button secondary" onClick={async () => { const response = await fetch(`/api/manage-booking/${token}/setup-intent`, { method: "POST" }); setSetup(await response.json()); }}>Change card for scheduled payment</button> : setup.clientSecret ? <Elements stripe={loadStripe(setup.publishableKey, { stripeAccount: setup.connectedAccount })} options={{ clientSecret: setup.clientSecret }}><CardForm token={token}/></Elements> : <p role="status">{setup.error}</p>;
}
