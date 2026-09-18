"use client";
import { useEffect, useMemo, useState } from "react";
import { CardElement, Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

type Setup = { clientSecret: string; connectedAccount: string; publishableKey: string };
type ElementState = "loading" | "ready" | "failed";
function CardForm({ token, clientSecret, onCancel, onSaved, onLoadError, onReady }: { token: string; clientSecret: string; onCancel: () => void; onSaved: (message: string) => void; onLoadError: () => void; onReady: () => void }) {
  const stripe = useStripe(); const elements = useElements(); const [error, setError] = useState(""); const [saving, setSaving] = useState(false); const [fallback, setFallback] = useState(false); const [elementReady, setElementReady] = useState(false);
  const ready = () => { setElementReady(true); onReady(); };
  return <form className="manage-booking-card-form" onSubmit={async event => {
    event.preventDefault(); if (!stripe || !elements || saving || !elementReady) return; setSaving(true); setError("");
    const result = fallback ? await stripe.confirmCardSetup(clientSecret, { payment_method: { card: elements.getElement(CardElement)! } }) : await stripe.confirmSetup({ elements, redirect: "if_required" });
    if (result.error || !result.setupIntent) { setError(result.error?.message ?? "We couldn't update the payment method right now."); setSaving(false); return; }
    const response = await fetch(`/api/manage-booking/${token}/setup-intent/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ setupIntentId: result.setupIntent.id }) });
    const data = await response.json(); setSaving(false);
    if (!data.ok) { setError(data.error ?? "We couldn't update the payment method right now."); return; }
    onSaved(`Payment method updated. This card will be used for your scheduled balance payment.${data.brand && data.last4 ? ` ${String(data.brand).replace(/^./, char => char.toUpperCase())} •••• ${data.last4}` : ""}`);
  }}>
    <p>Enter the card you&apos;d like us to use for the scheduled balance payment.</p>
    <div className="manage-booking-card-element">{fallback ? <CardElement onReady={ready}/> : <PaymentElement onReady={ready} onLoadError={() => { setFallback(true); setElementReady(false); }}/>}</div>
    <div className="manage-booking-card-actions"><button className="button" disabled={!stripe || saving} hidden={!elementReady}>{saving ? "Saving..." : "Save new card"}</button><button className="button secondary small" type="button" disabled={saving} onClick={onCancel}>Cancel</button></div>
    {error && <p role="alert">{error}</p>}
  </form>;
}
export function ManageBookingCardUpdate({ token }: { token: string }) {
  const [setup, setSetup] = useState<Setup | null>(null); const [opening, setOpening] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [elementState, setElementState] = useState<ElementState>("loading");
  const stripePromise = useMemo(() => setup ? loadStripe(setup.publishableKey, { stripeAccount: setup.connectedAccount }) : null, [setup]);
  useEffect(() => { if (!setup || elementState !== "loading") return; const timeout = window.setTimeout(() => setElementState(current => current === "loading" ? "failed" : current), 10000); return () => window.clearTimeout(timeout); }, [setup, elementState]);
  const open = async () => { if (opening) return; setOpening(true); setError(""); setSuccess(""); try { const response = await fetch(`/api/manage-booking/${token}/setup-intent`, { method: "POST" }); const data = await response.json(); if (!data.clientSecret || !data.publishableKey || !data.connectedAccount) { setError(data.error ?? "We couldn't open a secure card form right now."); return; } setElementState("loading"); setSetup(data); } catch { setError("We couldn't open a secure card form right now."); } finally { setOpening(false); } };
  const close = () => { setSetup(null); setElementState("loading"); };
  return <div className="manage-booking-card-update">
    <button className="button secondary" type="button" disabled={opening} onClick={open}>{opening ? "Opening secure card form..." : "Change card for scheduled payment"}</button>
    {setup && stripePromise && <Elements stripe={stripePromise} options={{ clientSecret: setup.clientSecret }}><CardForm token={token} clientSecret={setup.clientSecret} onCancel={close} onSaved={message => { close(); setSuccess(message); }} onReady={() => setElementState("ready")} onLoadError={() => setElementState("failed")}/></Elements>}
    {elementState === "loading" && setup && <p role="status">Loading secure card form...</p>}{elementState === "failed" && <p role="alert">We couldn&apos;t load the secure card form. Please refresh and try again.</p>}{error && <p role="alert">{error}</p>}{success && <p role="status">{success}</p>}
  </div>;
}
