import Link from "next/link";
import { WorkspaceNav } from "../../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageBusiness } from "@/lib/access";
import { acquisitionDateRange } from "@/lib/acquisitionReporting";
import {
  type AttributedBookingRow,
  buildSourcePerformanceReport,
  labelForSource,
  marketingSources,
  normalizeMarketingSource,
  type FunnelEventRow,
  type MarketingSource,
} from "@/lib/marketingAttribution";
import { MultiPlatformSpendProvider } from "@/lib/marketingSpend";
import { buildRoasCardModel, loadAdPlatformStatuses } from "@/lib/adPlatform";

const money = (cents: number | null) => cents == null ? "Ad spend not connected" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const percent = (value: number | null) => value == null ? "—" : `${Math.round(value * 100)}%`;
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const sourceOptions = ["all", ...marketingSources] as const;
type SourceFilter = typeof sourceOptions[number];
type BookingItemRow = {
  booking_id: string | null;
  inventory_item_id: string | null;
  rental_date: string | null;
  quantity: number | null;
  unit_price_cents: number | null;
};

function canonicalEventName(value: string) {
  const map: Record<string, string> = {
    landing_page_view: "landing_view",
    landing_view: "landing_view",
    service_view: "service_view",
    inventory_view: "inventory_view",
    inventory_item_view: "inventory_view",
    rental_viewed: "inventory_view",
    booking_cta_click: "booking_cta_click",
    inventory_item_clicked: "booking_cta_click",
    check_availability_clicked: "booking_cta_click",
    reserve_clicked: "booking_cta_click",
    availability_check_started: "availability_check",
    availability_check: "availability_check",
    rental_availability_checked: "availability_check",
    date_selected: "date_selected",
    availability_date_selected: "date_selected",
    event_date_selected: "date_selected",
    event_date_changed: "date_selected",
    checkout_started: "checkout_started",
    booking_started: "checkout_started",
    item_added_to_cart: "checkout_started",
    lead_submitted: "lead_submitted",
    customer_info_entered: "lead_submitted",
    booking_completed: "booking_completed",
    payment_completed: "payment_completed",
  };
  return map[value] ?? value;
}

function dateKey(row: FunnelEventRow) {
  const metadata = row.metadata as Record<string, unknown> | null | undefined;
  const value = typeof metadata?.date === "string" ? metadata.date : null;
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function monthValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  return monthValue(new Date(year, (month || 1) - 1 + delta, 1));
}

function formatLongDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: timezone }).format(new Date(`${value}T12:00:00Z`));
}

function normalizeSourceForRow(row: FunnelEventRow) {
  const session = Array.isArray(row.booking_attribution_sessions) ? row.booking_attribution_sessions[0] : row.booking_attribution_sessions;
  return normalizeMarketingSource(session);
}

function sourceMatches(row: FunnelEventRow, source: SourceFilter) {
  return source === "all" || normalizeSourceForRow(row) === source;
}

function queryString(values: Record<string, string | undefined | null>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function buildRequestedDateAnalytics(events: FunnelEventRow[], itemNames: Map<string, string>) {
  const totals = new Map<string, number>();
  const itemBreakdowns = new Map<string, Map<string, number>>();
  const sourceBreakdowns = new Map<string, Map<MarketingSource, number>>();
  for (const row of events) {
    const canonical = canonicalEventName(String(row.event_name));
    if (canonical !== "availability_check" && canonical !== "date_selected") continue;
    const requestedDate = dateKey(row);
    if (!requestedDate) continue;
    totals.set(requestedDate, (totals.get(requestedDate) ?? 0) + 1);
    const source = normalizeSourceForRow(row);
    const sourceBucket = sourceBreakdowns.get(requestedDate) ?? new Map<MarketingSource, number>();
    sourceBucket.set(source, (sourceBucket.get(source) ?? 0) + 1);
    sourceBreakdowns.set(requestedDate, sourceBucket);
    if (!row.inventory_item_id) continue;
    const itemBucket = itemBreakdowns.get(requestedDate) ?? new Map<string, number>();
    itemBucket.set(row.inventory_item_id, (itemBucket.get(row.inventory_item_id) ?? 0) + 1);
    itemBreakdowns.set(requestedDate, itemBucket);
  }
  const busiest = [...totals.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] ?? null;
  return {
    totals,
    busiestDate: busiest?.[0] ?? null,
    detail(date: string) {
      return {
        total: totals.get(date) ?? 0,
        items: [...(itemBreakdowns.get(date) ?? new Map<string, number>()).entries()]
          .map(([itemId, count]) => ({ itemId, name: itemNames.get(itemId) ?? "Rental item", count }))
          .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
        sources: [...(sourceBreakdowns.get(date) ?? new Map<MarketingSource, number>()).entries()]
          .map(([source, count]) => ({ source, label: labelForSource(source), count }))
          .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
      };
    },
  };
}

function buildRequestedDateCells(month: string, totals: Map<string, number>) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, (monthNumber || 1) - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber || 1, 0)).getUTCDate();
  const cells: Array<{ date: string | null; day: number | null; count: number }> = [];
  for (let index = 0; index < firstDay; index += 1) cells.push({ date: null, day: null, count: 0 });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    cells.push({ date, day, count: totals.get(date) ?? 0 });
  }
  return cells;
}

function buildRentalItemAnalytics(events: FunnelEventRow[], bookingItems: BookingItemRow[], bookingSourceMap: Map<string, MarketingSource>, itemNames: Map<string, string>) {
  const rows = new Map<string, { id: string; name: string; views: number; datePicks: number; bookingStarts: number; bookings: number; revenueCents: number }>();
  const bucket = (itemId: string) => {
    const existing = rows.get(itemId);
    if (existing) return existing;
    const next = { id: itemId, name: itemNames.get(itemId) ?? "Rental item", views: 0, datePicks: 0, bookingStarts: 0, bookings: 0, revenueCents: 0 };
    rows.set(itemId, next);
    return next;
  };
  for (const row of events) {
    if (!row.inventory_item_id) continue;
    const current = bucket(row.inventory_item_id);
    const canonical = canonicalEventName(String(row.event_name));
    if (canonical === "inventory_view") current.views += 1;
    if (canonical === "booking_cta_click") current.bookingStarts += 1;
    if (canonical === "availability_check" || canonical === "date_selected") current.datePicks += 1;
  }
  for (const row of bookingItems) {
    const itemId = row.inventory_item_id?.trim();
    const bookingId = row.booking_id?.trim();
    if (!itemId || !bookingId || !bookingSourceMap.has(bookingId)) continue;
    const current = bucket(itemId);
    current.bookings += 1;
    current.revenueCents += Math.max(0, Number(row.unit_price_cents ?? 0) * Math.max(1, Number(row.quantity ?? 1)));
  }
  return [...rows.values()].sort((left, right) => right.views - left.views || right.datePicks - left.datePicks || right.bookings - left.bookings || left.name.localeCompare(right.name));
}

function buildInsights(report: ReturnType<typeof buildSourcePerformanceReport>, requestedDates: ReturnType<typeof buildRequestedDateAnalytics>, items: ReturnType<typeof buildRentalItemAnalytics>, timezone: string, source: SourceFilter) {
  const list: string[] = [];
  if (report.totals.visits < 25) list.push(`Not enough ${source === "all" ? "traffic" : sourceLabel(source).toLowerCase()} yet to make a reliable recommendation.`);
  const strongestSource = [...report.summaries].sort((left, right) => right.revenueCents - left.revenueCents || right.visits - left.visits)[0];
  if (strongestSource) list.push(strongestSource.insight);
  if (items[0]?.views) list.push(`${items[0].name} is receiving the most interest in this report window.`);
  if (requestedDates.busiestDate) list.push(`${formatLongDate(requestedDates.busiestDate, timezone)} is currently your most-requested rental date.`);
  return [...new Set(list)].slice(0, 3);
}

function sourceLabel(source: SourceFilter) {
  return source === "all" ? "All traffic" : labelForSource(source);
}

export default async function BookingFunnelPage({ params, searchParams }: { params: Promise<{ businessSlug: string }>; searchParams: Promise<{ range?: string; from?: string; to?: string; source?: string; month?: string; date?: string }> }) {
  const { businessSlug } = await params;
  const q = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  if (!canManageBusiness(role)) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile} /><section className="epic3-content marketing-page"><div className="workspace-notice error">Only owners and administrators can view marketing analytics.</div></section></main>;
  const window = acquisitionDateRange(q.range, q.from, q.to, new Date(), business.timezone);
  const source = sourceOptions.includes((q.source ?? "all") as SourceFilter) ? (q.source ?? "all") as SourceFilter : "all";
  const [eventsResponse, spendBySource, inventoryResponse, bookingItemsResponse, snapshotsResponse, bookingsResponse] = await Promise.all([
    supabase.from("booking_funnel_events").select("event_name,occurred_at,attribution_session_id,booking_id,customer_id,inventory_item_id,service_id,invoice_id,booking_total_cents,amount_paid_cents,currency,metadata,booking_attribution_sessions(utm_source,utm_medium,utm_campaign,utm_content,utm_term,first_referrer,first_landing_url,first_landing_path,gclid,gbraid,wbraid,fbclid)").eq("business_id", business.id).gte("occurred_at", window.from).lt("occurred_at", window.to),
    new MultiPlatformSpendProvider(supabase).getSpendBySource({ businessId: business.id, from: window.from, to: window.to }),
    supabase.from("inventory_items").select("id,name").eq("business_id", business.id).order("name"),
    supabase.from("booking_items").select("booking_id,inventory_item_id,rental_date,quantity,unit_price_cents,bookings!inner(created_at,business_id)").eq("bookings.business_id", business.id).gte("bookings.created_at", window.from).lt("bookings.created_at", window.to),
    supabase.from("booking_attribution_snapshots").select("booking_id,first_referrer,first_landing_url,first_landing_path,utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,gbraid,wbraid,fbclid").eq("business_id", business.id),
    supabase.from("bookings").select("id,status,total_cents,booking_attribution_snapshots(first_referrer,first_landing_url,first_landing_path,utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,gbraid,wbraid,fbclid)").eq("business_id", business.id).gte("created_at", window.from).lt("created_at", window.to),
  ]);
  if (eventsResponse.error) {
    return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile} /><section className="epic3-content marketing-page marketing-funnel-page"><header className="marketing-analytics-header"><div><span className="sv-kicker">Marketing analytics</span><h1>Website analytics</h1><p>See what customers are trying to rent, which dates they want, and which marketing sources are converting.</p><small>{business.name}</small></div></header><nav className="marketing-subnav" aria-label="Marketing sections"><Link href={`/app/${businessSlug}/marketing/funnel`} aria-current="page">Funnel</Link><Link href={`/app/${businessSlug}/marketing/discounts`}>Discounts</Link><Link href={`/app/${businessSlug}/marketing/google-ads`}>Google Ads</Link></nav><div className="workspace-notice error">Apply the marketing attribution funnel migration to view this report.</div></section></main>;
  }
  const events = ((eventsResponse.data ?? []) as FunnelEventRow[]).filter((row) => sourceMatches(row, source));
  const attributedBookings = ((bookingsResponse.data ?? []) as Array<{ id: string; status: string | null; total_cents: number | null; booking_attribution_snapshots?: unknown }>).map((row) => ({
    booking_id: row.id,
    status: row.status,
    total_cents: row.total_cents,
    booking_attribution_snapshots: row.booking_attribution_snapshots as AttributedBookingRow["booking_attribution_snapshots"],
  })).filter((row) => source === "all" || normalizeMarketingSource(Array.isArray(row.booking_attribution_snapshots) ? row.booking_attribution_snapshots[0] : row.booking_attribution_snapshots) === source);
  const report = buildSourcePerformanceReport(events, attributedBookings, source === "all" ? spendBySource : Object.fromEntries(marketingSources.map((key) => [key, key === source ? spendBySource[key] ?? null : null])) as Partial<Record<MarketingSource, number | null>>);
  const itemNames = new Map(((inventoryResponse.data ?? []) as Array<{ id: string; name: string | null }>).map((item) => [item.id, item.name?.trim() || "Rental item"]));
  const bookingSourceMap = new Map<string, MarketingSource>();
  for (const row of snapshotsResponse.data ?? []) {
    const normalized = normalizeMarketingSource(row as any);
    if (source === "all" || normalized === source) bookingSourceMap.set(String((row as { booking_id?: string | null }).booking_id ?? ""), normalized);
  }
  const bookingItems = ((bookingItemsResponse.data ?? []) as BookingItemRow[]).filter((row) => source === "all" || bookingSourceMap.has(String(row.booking_id ?? "")));
  const requestedDates = buildRequestedDateAnalytics(events, itemNames);
  const itemRows = buildRentalItemAnalytics(events, bookingItems, bookingSourceMap, itemNames);
  const selectedMonth = /^\d{4}-\d{2}$/.test(q.month ?? "") ? q.month! : (requestedDates.busiestDate?.slice(0, 7) ?? monthValue(new Date()));
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(q.date ?? "") ? q.date! : (requestedDates.busiestDate ?? `${selectedMonth}-01`);
  const dateDetail = requestedDates.detail(selectedDate);
  const insights = buildInsights(report, requestedDates, itemRows, business.timezone, source);
  const totalBookings = report.summaries.reduce((sum, row) => sum + (row.detailedCounts.booking_completed ?? 0), 0);
  const totalSpend = source === "all" ? report.totals.spendCents : Number(spendBySource[source] ?? 0);
  const adPlatformStatuses = await loadAdPlatformStatuses(supabase, business.id, window.from, window.to);
  const roasCard = buildRoasCardModel({ statuses: adPlatformStatuses, attributedRevenueCents: report.totals.revenueCents, roas: report.totals.roas });
  const stepLookup = new Map((report.summaries[0]?.stepCounts ?? []).map((step) => [step.key, step]));
  const cells = buildRequestedDateCells(selectedMonth, requestedDates.totals);

  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile} /><section className="epic3-content marketing-page marketing-funnel-page">
    <header className="marketing-analytics-header"><div><span className="sv-kicker">Marketing analytics</span><h1>Website analytics</h1><p>See what customers are trying to rent, when they need it, and which sources are producing bookings.</p><small>{business.name}</small></div></header>
    <nav className="marketing-subnav" aria-label="Marketing sections"><Link href={`/app/${businessSlug}/marketing/funnel`} aria-current="page">Funnel</Link><Link href={`/app/${businessSlug}/marketing/discounts`}>Discounts</Link><Link href={`/app/${businessSlug}/marketing/google-ads`}>Google Ads</Link><Link href={`/app/${businessSlug}/marketing/meta-ads`}>Meta Ads</Link></nav>
    <section className="workspace-panel marketing-filter-panel">
      <form className="marketing-filter-bar" method="get">
        <label>From<input type="date" name="from" defaultValue={window.from.slice(0, 10)} /></label>
        <label>To<input type="date" name="to" defaultValue={window.to.slice(0, 10)} /></label>
        <label>Traffic source<select name="source" defaultValue={source}><option value="all">All traffic</option>{marketingSources.map((value) => <option key={value} value={value}>{labelForSource(value)}</option>)}</select></label>
        <input type="hidden" name="month" value={selectedMonth} />
        <input type="hidden" name="date" value={selectedDate} />
        <button className="sv-button">Update report</button>
      </form>
      <div className="marketing-quick-filters">
        <span>Quick filters</span>
        <a className="sv-button sv-secondary sv-small" href={`/app/${businessSlug}/marketing/funnel?${queryString({ range: "today", source })}`}>Today</a>
        <a className="sv-button sv-secondary sv-small" href={`/app/${businessSlug}/marketing/funnel?${queryString({ range: "7d", source })}`}>Last 7 days</a>
        <a className="sv-button sv-secondary sv-small" href={`/app/${businessSlug}/marketing/funnel?${queryString({ range: "30d", source })}`}>Last 30 days</a>
        <a className="sv-button sv-secondary sv-small" href={`/app/${businessSlug}/marketing/funnel?${queryString({ range: "month", source })}`}>This month</a>
      </div>
      <p className="marketing-filter-note">The report date range controls when the interaction happened. Requested rental dates below show the date the customer was trying to book.</p>
    </section>

    <section className="marketing-kpi-grid">
      <article className="workspace-panel"><span>Visits</span><strong>{report.totals.visits}</strong><small>Attributed session visits</small></article>
      <article className="workspace-panel"><span>Engaged visitors</span><strong>{report.totals.engaged}</strong><small>Viewed a rental or service</small></article>
      <article className="workspace-panel"><span>Booking starts / leads</span><strong>{report.totals.leadsOrBookings}</strong><small>Visitors progressing into the flow</small></article>
      <article className="workspace-panel"><span>Bookings</span><strong>{totalBookings}</strong><small>Completed bookings during this period</small></article>
      <article className="workspace-panel"><span>Revenue</span><strong>{money(report.totals.revenueCents)}</strong><small>Attributed booking value</small></article>
      <article className="workspace-panel"><span>Ad spend / ROAS</span><strong>{roasCard.headline}</strong><small>{roasCard.detail}</small></article>
    </section>

    <section className="workspace-panel">
      <header><div><h2>Servonas insights</h2><p>Deterministic recommendations based on the selected reporting window.</p></div></header>
      <div className="marketing-conversion-list">{insights.map((insight) => <div key={insight}><dt>Insight</dt><dd>{insight}</dd></div>)}</div>
    </section>

    <section className="workspace-panel">
      <header><div><h2>Customer journey</h2><p>Track how visitors move from visit to booking and revenue.</p></div></header>
      <div className="marketing-sources-table">
        <div><b>Step</b><b>Count</b><b>Progress</b><b>Drop-off</b></div>
        {[
          ["landing_view", "Visits"],
          ["engaged", "Item / service views"],
          ["booking_cta_click", "Booking starts"],
          ["availability_check", "Availability checks"],
          ["date_selected", "Date selections"],
          ["checkout_started", "Checkout starts"],
          ["booking_completed", "Bookings"],
        ].map(([key, label], index) => {
          const step = stepLookup.get(key) ?? { count: 0, progressFromPrevious: index === 0 ? null : 0, dropOffRate: index === 0 ? null : 0 };
          return <div key={key}><span>{label}</span><span>{step.count}</span><span>{percent(step.progressFromPrevious)}</span><span>{percent(step.dropOffRate)}</span></div>;
        })}
        <div><span>Revenue</span><span>{money(report.totals.revenueCents)}</span><span>—</span><span>—</span></div>
      </div>
    </section>

    <section className="workspace-panel marketing-sources-panel">
      <header><div><h2>Traffic source performance</h2><p>Choose a traffic source above to update the funnel, requested rental dates, most-clicked rentals, bookings, revenue, and insights.</p></div></header>
      <div className="marketing-sources-table"><div><b>Source</b><b>Visits</b><b>Item views</b><b>Booking starts</b><b>Bookings</b><b>Revenue</b></div>{report.summaries.map((row) => <div key={row.source}><span>{labelForSource(row.source)}</span><span>{row.visits}</span><span>{row.engaged}</span><span>{row.detailedCounts.booking_cta_click ?? 0}</span><span>{row.detailedCounts.booking_completed ?? 0}</span><span>{money(row.revenueCents)}</span></div>)}</div>
    </section>

    <section className="marketing-kpi-grid" aria-label="Paid ad platform summary">
      {adPlatformStatuses.map((status) => <article className="workspace-panel" key={status.provider}><span>{status.providerLabel}</span><strong>{money(status.spendCents)}</strong><small>{status.state === "connected_with_data" ? `Last sync ${status.lastSuccessfulSyncAt ? new Date(status.lastSuccessfulSyncAt).toLocaleString() : "available"}` : status.state.replaceAll("_"," ")}</small></article>)}
      <article className="workspace-panel"><span>Total paid ad spend</span><strong>{money(adPlatformStatuses.reduce((sum,row)=>sum+row.spendCents,0))}</strong><small>Google Ads + Meta Ads</small></article>
    </section>

    <section className="workspace-panel">
      <header><div><h2>Requested rental dates</h2><p>See which dates customers are trying to book for. These dates represent the requested rental date, not the day the click happened.</p></div></header>
      <div className="marketing-requested-dates-summary">
        <article><span>Month</span><strong>{monthLabel(selectedMonth)}</strong></article>
        <article><span>Total rental-date selections/checks</span><strong>{[...requestedDates.totals.entries()].filter(([date]) => date.startsWith(selectedMonth)).reduce((sum, [, count]) => sum + count, 0)}</strong></article>
        <article><span>Busiest requested date</span><strong>{requestedDates.busiestDate ? formatLongDate(requestedDates.busiestDate, business.timezone) : "No demand yet"}</strong></article>
        <article><span>Days with demand</span><strong>{[...requestedDates.totals.keys()].filter((date) => date.startsWith(selectedMonth)).length}</strong></article>
      </div>
      <div className="marketing-requested-dates-layout">
        <div className="booking-calendar marketing-requested-calendar">
          <div className="booking-calendar-head">
            <Link href={`/app/${businessSlug}/marketing/funnel?${queryString({ from: window.from.slice(0, 10), to: window.to.slice(0, 10), source, month: shiftMonth(selectedMonth, -1), date: selectedDate })}`} aria-label="Previous month">‹</Link>
            <h2>{monthLabel(selectedMonth)}</h2>
            <Link href={`/app/${businessSlug}/marketing/funnel?${queryString({ from: window.from.slice(0, 10), to: window.to.slice(0, 10), source, month: shiftMonth(selectedMonth, 1), date: selectedDate })}`} aria-label="Next month">›</Link>
          </div>
          <form className="marketing-month-jump" method="get">
            <input type="hidden" name="from" value={window.from.slice(0, 10)} />
            <input type="hidden" name="to" value={window.to.slice(0, 10)} />
            <input type="hidden" name="source" value={source} />
            <input type="hidden" name="date" value={selectedDate} />
            <label>Jump to month<input type="month" name="month" defaultValue={selectedMonth} /></label>
            <button className="sv-button sv-secondary sv-small">Go</button>
          </form>
          <div className="booking-weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="booking-calendar-grid marketing-demand-grid">
            {cells.map((cell, index) => cell.date ? <Link key={cell.date} href={`/app/${businessSlug}/marketing/funnel?${queryString({ from: window.from.slice(0, 10), to: window.to.slice(0, 10), source, month: selectedMonth, date: cell.date })}`} className={`marketing-demand-day${selectedDate === cell.date ? " selected" : ""}`}><strong>{cell.day}</strong><small>{cell.count}</small></Link> : <span key={`blank-${index}`} className="marketing-demand-day blank" />)}
          </div>
        </div>
        <aside className="workspace-panel marketing-requested-date-detail">
          <span className="sv-kicker">Selected date</span>
          <h3>{formatLongDate(selectedDate, business.timezone)}</h3>
          <p>{dateDetail.total} rental-date click{dateDetail.total === 1 ? "" : "s"}</p>
          <div className="marketing-conversion-list">{dateDetail.items.length ? dateDetail.items.map((item) => <div key={item.itemId}><dt>{item.name}</dt><dd>{item.count}</dd></div>) : <div><dt>No item detail yet</dt><dd>Customers picked this date without a specific rental attached.</dd></div>}</div>
          {dateDetail.sources.length ? <div className="marketing-requested-date-sources"><h4>Source breakdown</h4><div className="marketing-conversion-list">{dateDetail.sources.map((entry) => <div key={entry.source}><dt>{entry.label}</dt><dd>{entry.count}</dd></div>)}</div></div> : null}
        </aside>
      </div>
    </section>

    <section className="workspace-panel">
      <header><div><h2>Most-clicked rental items</h2><p>Understand exactly which rentals customers were interested in during the selected report window.</p></div></header>
      <div className="marketing-sources-table marketing-rental-items-table"><div><b>Rental item</b><b>Views / clicks</b><b>Date picks / availability checks</b><b>Booking starts</b><b>Bookings</b><b>Revenue</b></div>{itemRows.map((item) => <div key={item.id}><span>{item.name}</span><span>{item.views}</span><span>{item.datePicks}</span><span>{item.bookingStarts}</span><span>{item.bookings}</span><span>{money(item.revenueCents)}</span></div>)}</div>
      <div className="marketing-rental-item-cards">{itemRows.map((item) => <article className="workspace-panel" key={`mobile-${item.id}`}><h3>{item.name}</h3><p>{item.views} views</p><p>{item.datePicks} date picks</p><p>{item.bookings} bookings</p><p>{money(item.revenueCents)} revenue</p></article>)}</div>
    </section>
  </section></main>;
}
