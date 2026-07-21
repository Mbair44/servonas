import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
export const dynamic = "force-dynamic";
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100); }
export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const supabase = getSupabaseAdmin(); if (!supabase) notFound();
  const { data } = await supabase.from("bookings").select("booking_number,status,total_cents,deposit_cents,discount_cents,balance_due_cents,paid_at,customers(first_name,last_name,email),booking_items(rental_date,unit_price_cents,inventory_items(name))").eq("receipt_token", token).single();
  if (!data) notFound();
  const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers;
  return <main className="section alt"><div className="container"><div className="form-card receipt-card"><span className="eyebrow">Payment receipt</span><h1>NRS Party Rentals</h1><p>Reservation <strong>#{data.booking_number}</strong></p><p>{customer?.first_name} {customer?.last_name}<br/>{customer?.email}</p><hr/>{(data.booking_items ?? []).map((item, i) => { const inv = Array.isArray(item.inventory_items) ? item.inventory_items[0] : item.inventory_items; return <div className="receipt-row" key={i}><span>{inv?.name}<br/><small>{item.rental_date}</small></span><strong>{money(item.unit_price_cents)}</strong></div>; })}<hr/><div className="receipt-row"><span>Rental total</span><strong>{money(data.total_cents)}</strong></div><div className="receipt-row"><span>Discount</span><strong>-{money(data.discount_cents)}</strong></div><div className="receipt-row"><span>Deposit paid</span><strong>{money(data.deposit_cents)}</strong></div><div className="receipt-row"><span>Remaining balance</span><strong>{money(data.balance_due_cents)}</strong></div><p className="muted">Status: {data.status.replaceAll("_", " ")}</p></div></div></main>;
}
