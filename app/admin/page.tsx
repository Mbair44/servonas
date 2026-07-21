import Link from "next/link";
import BlockedDatesManager from "@/components/BlockedDatesManager";
import InventoryManager from "@/components/InventoryManager";
import RefundManager from "@/components/RefundManager";
import CommunicationsManager from "@/components/CommunicationsManager";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";


type BlockedDateRow = {
  id: string;
  blocked_date: string;
  reason: string | null;
  inventory_items: { name: string } | { name: string }[] | null;
};


type RefundBookingRow = {
  id: string;
  booking_number: number;
  status: string;
  deposit_cents: number;
  refunded_cents: number;
  stripe_payment_intent_id: string | null;
  booking_items: { rental_date: string }[] | null;
  customers: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
};

type BookingRow = {
  id: string;
  booking_number: number;
  status: string;
  rental_date: string;
  event_start_time: string;
  event_end_time: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  inventory_name: string;
  total_cents: number;
  created_at: string;
};

function money(cents: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format((cents ?? 0) / 100);
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function displayTime(value: string) {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function statusClass(status: string) {
  if (["paid", "confirmed", "completed"].includes(status)) return "paid";
  if (["cancelled", "expired", "refunded"].includes(status)) return "cancelled";
  return "pending";
}

export default async function AdminPage() {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return (
      <main className="section alt">
        <div className="container">
          <div className="admin-empty-state">
            <span className="eyebrow">Admin setup</span>
            <h1>Connect the private admin dashboard</h1>
            <p className="lead">
              Add <code>SUPABASE_SERVICE_ROLE_KEY</code> to your local <code>.env.local</code>,
              restart the development server, and reload this page.
            </p>
            <p className="notice">
              Keep this key private. Never prefix it with <code>NEXT_PUBLIC_</code> and never commit
              <code>.env.local</code> to GitHub.
            </p>
            <Link className="button" href="/">Return to website</Link>
          </div>
        </div>
      </main>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const [bookingsResult, customerCountResult, inventoryResult, blockedResult, refundBookingsResult, smsTemplatesResult, smsLogsResult, smsBookingOptionsResult] = await Promise.all([
    supabase
      .from("booking_details")
      .select("*")
      .gte("rental_date", today)
      .order("rental_date", { ascending: true })
      .order("event_start_time", { ascending: true }),
    supabase.from("customers").select("id", { count: "exact", head: true }),
    supabase
      .from("inventory_items")
      .select("id,name,slug,description,daily_price_cents,image_url,image_urls,active,allow_quantity,stock_quantity,created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("blocked_dates")
      .select("id,blocked_date,reason,inventory_items(name)")
      .gte("blocked_date", today)
      .order("blocked_date", { ascending: true }),
    supabase
      .from("bookings")
      .select("id,booking_number,status,deposit_cents,refunded_cents,stripe_payment_intent_id,booking_items(rental_date),customers(first_name,last_name)")
      .not("stripe_payment_intent_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("sms_templates").select("template_key,display_name,body,enabled").order("template_key"),
    supabase.from("sms_messages").select("id,template_key,to_phone,body,status,error_message,created_at,sent_at,bookings(booking_number)").order("created_at", { ascending: false }).limit(100),
    supabase.from("bookings").select("id,booking_number,customers(first_name,last_name)").in("status", ["paid","confirmed","completed"]).order("created_at", { ascending: false }).limit(100),
  ]);

  const error =
    bookingsResult.error || inventoryResult.error || blockedResult.error || customerCountResult.error || refundBookingsResult.error || smsTemplatesResult.error || smsLogsResult.error || smsBookingOptionsResult.error;

  if (error) {
    return (
      <main className="section alt">
        <div className="container">
          <div className="admin-empty-state">
            <span className="eyebrow">Dashboard error</span>
            <h1>We could not load the admin data</h1>
            <p className="notice">{error.message}</p>
            <p className="muted">
              Confirm that the database schema and booking SQL scripts have both been run.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const bookings = (bookingsResult.data ?? []) as BookingRow[];
  const inventory = inventoryResult.data ?? [];
  const blockedDates = (blockedResult.data ?? []) as BlockedDateRow[];
  const refundRows = (refundBookingsResult.data ?? []) as RefundBookingRow[];
  const refundBookings = refundRows.map((booking) => {
    const customer = Array.isArray(booking.customers) ? booking.customers[0] : booking.customers;
    const item = booking.booking_items?.[0];
    return {
      id: booking.id,
      booking_number: booking.booking_number,
      customer_name: customer ? `${customer.first_name} ${customer.last_name}` : "Customer",
      rental_date: item?.rental_date ?? "",
      status: booking.status,
      deposit_cents: booking.deposit_cents ?? 0,
      refunded_cents: booking.refunded_cents ?? 0,
      stripe_payment_intent_id: booking.stripe_payment_intent_id,
    };
  }).filter((booking) => booking.deposit_cents > booking.refunded_cents);
  const activeBookings = bookings.filter((booking) =>
    ["pending_payment", "paid", "confirmed"].includes(booking.status)
  );
  const paidBookings = bookings.filter((booking) =>
    ["paid", "confirmed", "completed"].includes(booking.status)
  );
  const upcomingRevenue = paidBookings.reduce((sum, booking) => sum + booking.total_cents, 0);
  const todayBookings = activeBookings.filter((booking) => booking.rental_date === today);

  return (
    <main className="admin-page">
      <div className="container admin-shell">
        <aside className="sidebar admin-sidebar">
          <div>
            <span className="admin-brand-kicker">NRS</span>
            <h3>Admin Dashboard</h3>
          </div>
          <nav>
            <a className="active" href="#overview">Overview</a>
            <a href="#bookings">Bookings</a>
            <a href="#inventory">Inventory</a>
            <a href="#blocked">Blocked dates</a>
            <a href="#refunds">Refunds</a>
            <a href="#communications">Communications</a>
          </nav>
          <div className="admin-sidebar-footer">
            <Link href="/book">Open booking page</Link>
            <Link href="/">View website</Link>
          </div>
        </aside>

        <section className="admin-content">
          <header className="admin-header" id="overview">
            <div>
              <span className="eyebrow">Business overview</span>
              <h1>NRS Party Rentals</h1>
              <p className="muted">Upcoming operations and reservation activity.</p>
            </div>
            <div className="admin-date">{displayDate(today)}</div>
          </header>

          <div className="stat-grid">
            <article className="stat-card">
              <span>Upcoming bookings</span>
              <strong>{activeBookings.length}</strong>
              <small>{todayBookings.length} scheduled today</small>
            </article>
            <article className="stat-card">
              <span>Paid revenue</span>
              <strong>{money(upcomingRevenue)}</strong>
              <small>From upcoming paid reservations</small>
            </article>
            <article className="stat-card">
              <span>Customers</span>
              <strong>{customerCountResult.count ?? 0}</strong>
              <small>Total customer records</small>
            </article>
            <article className="stat-card">
              <span>Active inventory</span>
              <strong>{inventory.filter((item) => item.active).length}</strong>
              <small>{inventory.length} total items</small>
            </article>
          </div>

          <section className="admin-panel" id="bookings">
            <div className="admin-panel-header">
              <div>
                <span className="eyebrow">Schedule</span>
                <h2>Upcoming bookings</h2>
              </div>
              <Link className="button small" href="/book">Create test booking</Link>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reservation</th>
                    <th>Date & time</th>
                    <th>Customer</th>
                    <th>Delivery</th>
                    <th>Status</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.length === 0 ? (
                    <tr>
                      <td colSpan={6}>No upcoming bookings yet.</td>
                    </tr>
                  ) : (
                    bookings.map((booking) => (
                      <tr key={`${booking.id}-${booking.inventory_name}`}>
                        <td>
                          <strong>#{booking.booking_number}</strong>
                          <br />
                          <span className="muted">{booking.inventory_name}</span>
                        </td>
                        <td>
                          <strong>{displayDate(booking.rental_date)}</strong>
                          <br />
                          <span className="muted">
                            {displayTime(booking.event_start_time)}–{displayTime(booking.event_end_time)}
                          </span>
                        </td>
                        <td>
                          <strong>{booking.first_name} {booking.last_name}</strong>
                          <br />
                          <a className="admin-contact" href={`mailto:${booking.email}`}>{booking.email}</a>
                          <br />
                          <a className="admin-contact" href={`tel:${booking.phone}`}>{booking.phone}</a>
                        </td>
                        <td>
                          {booking.delivery_address}
                          <br />
                          <span className="muted">
                            {booking.delivery_city}, {booking.delivery_state} {booking.delivery_zip}
                          </span>
                        </td>
                        <td>
                          <span className={`status ${statusClass(booking.status)}`}>
                            {booking.status.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td><strong>{money(booking.total_cents)}</strong></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="admin-lower-grid">
            <section className="admin-panel" id="inventory">
              <div className="admin-panel-header">
                <div>
                  <span className="eyebrow">Rentals</span>
                  <h2>Inventory</h2>
                </div>
              </div>
              <InventoryManager initialInventory={inventory} />
            </section>

            <section className="admin-panel" id="blocked">
              <div className="admin-panel-header">
                <div>
                  <span className="eyebrow">Availability</span>
                  <h2>Blocked dates</h2>
                </div>
              </div>
              <BlockedDatesManager
                inventory={inventory.map((item) => ({ id: item.id, name: item.name }))}
                initialBlockedDates={blockedDates}
              />
            </section>
          </div>

          <section className="admin-panel" id="refunds">
            <div className="admin-panel-header">
              <div>
                <span className="eyebrow">Payments</span>
                <h2>Stripe refunds</h2>
              </div>
            </div>
            <RefundManager initialBookings={refundBookings} />
          </section>


          <section className="admin-panel" id="communications">
            <div className="admin-panel-header"><div><span className="eyebrow">Customer messages</span><h2>SMS communications</h2></div></div>
            <CommunicationsManager
              initialTemplates={(smsTemplatesResult.data ?? []) as never}
              initialLogs={(smsLogsResult.data ?? []) as never}
              bookings={(smsBookingOptionsResult.data ?? []).map((row: any) => { const c = Array.isArray(row.customers) ? row.customers[0] : row.customers; return { id: row.id, booking_number: row.booking_number, customer_name: c ? `${c.first_name} ${c.last_name}` : "Customer" }; })}
            />
          </section>

          <p className="admin-security-note">
            This dashboard uses a private server-side Supabase key. Add authentication before deploying it publicly.
          </p>
        </section>
      </div>
    </main>
  );
}
