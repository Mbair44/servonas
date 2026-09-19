import { notFound } from "next/navigation";
import { resolveBookingManageToken } from "@/lib/bookingManage/tokens";
import { ManageBookingCardUpdate } from "@/components/ManageBookingCardUpdate";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
export const dynamic = "force-dynamic";
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0) / 100);
const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] ?? null : value;
const time = (value: string | null) => { const [hour = "0", minute = "00"] = String(value ?? "").split(":"); const h = Number(hour); return `${h % 12 || 12}:${minute} ${h >= 12 ? "PM" : "AM"}`; };
export default async function ManageBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params, access = await resolveBookingManageToken(token), db = getSupabaseAdmin();
  if (!access || !db) notFound();
  const { data: booking } = await db.from("bookings").select("booking_number,status,event_start_time,event_end_time,delivery_address,delivery_city,delivery_state,delivery_zip,subtotal_cents,discount_cents,tax_cents,delivery_fee_cents,total_cents,amount_paid_cents,balance_due_cents,balance_charge_scheduled_for,businesses(name,timezone),customers(first_name,last_name,email,phone),booking_items(quantity,rental_date,unit_price_cents,inventory_items(name))").eq("id", access.booking_id).eq("business_id", access.business_id).maybeSingle();
  if (!booking) notFound();
  const business = relation(booking.businesses), customer = relation(booking.customers), items = booking.booking_items ?? [], firstItem = items[0], timeZone = business?.timezone || "America/Phoenix";
  const rentalDate = firstItem?.rental_date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone }).format(new Date(`${firstItem.rental_date}T12:00:00`)) : "Rental date to be confirmed";
  const scheduled = booking.balance_charge_scheduled_for ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(booking.balance_charge_scheduled_for)) : null;
  const address = [booking.delivery_address, booking.delivery_city, [booking.delivery_state, booking.delivery_zip].filter(Boolean).join(" ")].filter(Boolean);
  return <main className="manage-booking-portal"><div className="manage-booking-shell">
    <header className="manage-booking-header"><p>Manage booking</p><div><strong>{business?.name}</strong><span>Reservation #{booking.booking_number}</span><b className="manage-booking-status">{booking.status.replaceAll("_", " ")}</b></div></header>
    <section className="manage-booking-card manage-booking-summary"><div><span className="manage-booking-date">{rentalDate}</span><p>{time(booking.event_start_time)} – {time(booking.event_end_time)}</p></div><address>{address.map((part, index) => <span key={index}>{part}</span>)}</address><div className="manage-booking-customer"><span>{[customer?.first_name, customer?.last_name].filter(Boolean).join(" ")}</span>{customer?.email && <span>{customer.email}</span>}{customer?.phone && <span>{customer.phone}</span>}</div></section>
    <section className="manage-booking-card"><h2>Your rental</h2><div className="manage-booking-items">{items.map((item: any) => { const inventory = relation(item.inventory_items); return <div key={`${item.rental_date}-${inventory?.name}`}><strong>{inventory?.name}</strong><span>Qty {item.quantity}</span><b>{money(item.unit_price_cents * item.quantity)}</b></div>; })}</div></section>
    <section className="manage-booking-card manage-booking-payment"><h2>Payment</h2><dl><div><dt>Total</dt><dd>{money(booking.total_cents)}</dd></div><div><dt>Paid</dt><dd>{money(booking.amount_paid_cents)}</dd></div><div className="manage-booking-remaining"><dt>Remaining</dt><dd>{money(booking.balance_due_cents)}</dd></div></dl>{scheduled && <div className="manage-booking-scheduled"><span>Scheduled payment</span><strong>{scheduled}</strong></div>}{Number(booking.balance_due_cents) > 0 ? <div className="manage-booking-payment-actions"><form action={`/api/manage-booking/${token}/pay`} method="post"><button className="button">Pay {money(booking.balance_due_cents)} now</button></form>{booking.balance_charge_scheduled_for && <ManageBookingCardUpdate token={token}/>}</div> : <p className="manage-booking-paid"><strong>Paid in full</strong></p>}</section>
    <section className="manage-booking-card manage-booking-secondary"><h2>Need to make a change?</h2><p>Contact {business?.name} if you need to change your date, time, address, or rental items.</p></section>
    <section className="manage-booking-card manage-booking-secondary"><h2>Cancellation</h2><p>Cancellation requests are reviewed by the business.</p></section>
  </div></main>;
}
