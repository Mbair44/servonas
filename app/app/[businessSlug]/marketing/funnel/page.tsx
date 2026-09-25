import {loadMetaAttributionResources} from "@/lib/metaAttributionResources";
import {availablePaidSpend,sourcePaidEconomics,totalPaidEconomics,formatPaidRoas,paidEconomicsHelp} from "@/lib/paidSourceEconomics";
import Link from "next/link";
import { WorkspaceNav } from "../../WorkspaceNav";
import { requireWorkspace } from "@/lib/workspace";
import { canManageBusiness } from "@/lib/access";
import { acquisitionDateRange } from "@/lib/acquisitionReporting";
import { dateInTimeZone } from "@/lib/bookingTime";
import {
  attachSessionMetricsToSourceReport,
  buildCampaignPerformanceReport,
  buildSessionQualityReport,
  buildLandingPageFunnelReport,
  buildSourceCheckoutFunnelReport,
  buildOrganicProviderPerformanceReport,
  buildGoogleBusinessProfileActionPerformanceReport,
  labelForGoogleBusinessProfileAction,
  type CheckoutFunnelSummary,
  type AttributedBookingRow,
  buildSourcePerformanceReport,
  defaultSessionEngagementThresholdMs,
  labelForSource,
  labelForOrganicProvider,
  organicProviders,
  marketingSources,
  normalizeMarketingSource,
  type FunnelEventRow,
  type MarketingSource,
  type MetaPerformanceNameRow,
} from "@/lib/marketingAttribution";
import { MultiPlatformSpendProvider } from "@/lib/marketingSpend";
import { buildRoasCardModel, loadAdPlatformStatuses } from "@/lib/adPlatform";
import { resolveAiInsights, buildPreviousPeriodReport } from "@/lib/aiInsights";

const money = (cents: number | null) => cents == null ? "Ad spend not connected" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const percent = (value: number | null) => value == null ? "—" : `${Math.round(value * 100)}%`;
const ms = (value: number | null, unavailableLabel = "Active time unavailable") => value == null ? unavailableLabel : value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}s`;
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const sourceOptions = ["all", ...marketingSources] as const;
const checkoutSteps:[string,string][]=[["checkout_started","Checkout started"],["checkout_addons_viewed","Add-ons viewed"],["checkout_addons_decision","Add-ons continued"],["reservation_details_viewed","Reservation details viewed"],["customer_info_completed","Customer info completed"],["delivery_address_completed","Delivery address completed"],["delivery_quote_requested","Quote requested"],["delivery_fee_presented","Delivery fee presented"],["terms_accepted","Terms accepted"],["payment_cta_clicked","Payment CTA clicked"],["payment_started","Payment started"],["payment_succeeded","Payment succeeded"],["booking_confirmed","Booking confirmed"]];
const checkoutActivityHelp="Each step counts sessions independently within the selected dates; steps can be skipped or completed out of order. These are not sequential cohort drop-off counts. Add-ons continued sums skipped and added counts; a session can appear in both.";
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
    booking_cta_click: "booking_start",
    inventory_item_clicked: "booking_start",
    check_availability_clicked: "booking_start",
    reserve_clicked: "booking_start",
    availability_check_started: "availability_check",
    availability_check: "availability_check",
    rental_availability_checked: "availability_check",
    booking_date_selected: "date_selected",
    date_selected: "date_selected",
    availability_date_selected: "date_selected",
    event_date_selected: "date_selected",
    event_date_changed: "date_selected",
    booking_started: "booking_start",
    item_added_to_cart: "item_added",
    checkout_started: "checkout_started",
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

function normalizeSourceForRow(row: FunnelEventRow, metaRows: MetaPerformanceNameRow[] = []) {
  const session = Array.isArray(row.booking_attribution_sessions) ? row.booking_attribution_sessions[0] : row.booking_attribution_sessions;
  return normalizeMarketingSource(session, metaRows);
}

function sourceMatches(row: FunnelEventRow, source: SourceFilter, metaRows: MetaPerformanceNameRow[]) {
  return source === "all" || normalizeSourceForRow(row, metaRows) === source;
}

function CheckoutFunnelDrilldown({ funnel }: { funnel: CheckoutFunnelSummary }) {
  const hasObservedSteps = checkoutSteps.some(([key]) => key === "checkout_addons_decision"
    ? (funnel.checkoutSteps.checkout_addons_skipped ?? 0) + (funnel.checkoutSteps.checkout_addons_added ?? 0) > 0
    : (funnel.checkoutSteps[key] ?? 0) > 0);
  return <div className="marketing-checkout-drilldown">
    <strong>Checkout activity</strong><p className="marketing-checkout-reconciliation">{checkoutActivityHelp}</p>
    {hasObservedSteps ? <div>{checkoutSteps.map(([key, label]) => {
      const count = key === "checkout_addons_decision" ? (funnel.checkoutSteps.checkout_addons_skipped ?? 0) + (funnel.checkoutSteps.checkout_addons_added ?? 0) : (funnel.checkoutSteps[key] ?? 0);
      return <span key={key}><b>{label}</b><em>{count}</em>{key === "checkout_addons_decision" && <small>{funnel.checkoutSteps.checkout_addons_skipped ?? 0} skipped · {funnel.checkoutSteps.checkout_addons_added ?? 0} added</small>}</span>;
    })}</div> : <p>No checkout-step data yet.</p>}
    {(funnel.checkoutSteps.delivery_quote_failed ?? 0) || (funnel.checkoutSteps.delivery_address_ineligible ?? 0) ? <p className="marketing-checkout-reconciliation">Delivery quote outcomes: {funnel.checkoutSteps.delivery_quote_failed ?? 0} failed · {funnel.checkoutSteps.delivery_address_ineligible ?? 0} ineligible/outside service area</p> : null}
    {funnel.completedBookings !== funnel.observedBookingConfirmed ? <p className="marketing-checkout-reconciliation">Attributed completed bookings: {funnel.completedBookings} · Observed booking-confirmed events: {funnel.observedBookingConfirmed}{funnel.completedBookings > funnel.observedBookingConfirmed ? ". Some historical completed bookings do not have a booking-confirmed funnel event." : ""}</p> : null}
  </div>;
}

function queryString(values: Record<string, string | undefined | null>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

function buildRequestedDateAnalytics(events: FunnelEventRow[], itemNames: Map<string, string>, metaRows: MetaPerformanceNameRow[]) {
  const totals = new Map<string, number>();
  const itemBreakdowns = new Map<string, Map<string, number>>();
  const sourceBreakdowns = new Map<string, Map<MarketingSource, number>>();
  for (const row of events) {
    const canonical = canonicalEventName(String(row.event_name));
    if (canonical !== "availability_check" && canonical !== "date_selected") continue;
    const requestedDate = dateKey(row);
    if (!requestedDate) continue;
    totals.set(requestedDate, (totals.get(requestedDate) ?? 0) + 1);
    const source = normalizeSourceForRow(row, metaRows);
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
  const rows = new Map<string, { id: string; name: string; clicks: number; datePicks: number; bookingStarts: number; bookings: number; revenueCents: number }>();
  const bucket = (itemId: string) => {
    const existing = rows.get(itemId);
    if (existing) return existing;
    const next = { id: itemId, name: itemNames.get(itemId) ?? "Rental item", clicks: 0, datePicks: 0, bookingStarts: 0, bookings: 0, revenueCents: 0 };
    rows.set(itemId, next);
    return next;
  };
  for (const row of events) {
    if (!row.inventory_item_id) continue;
    const current = bucket(row.inventory_item_id);
    const canonical = canonicalEventName(String(row.event_name));
    if (row.event_name === "inventory_item_clicked" || (row.event_name === "inventory_item_view" && row.metadata?.click_intent === true)) current.clicks += 1;
    if (canonical === "booking_start") current.bookingStarts += 1;
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
  return [...rows.values()].sort((left, right) => right.clicks - left.clicks || right.datePicks - left.datePicks || right.bookings - left.bookings || left.name.localeCompare(right.name));
}

function sourceLabel(source: SourceFilter) {
  return source === "all" ? "All traffic" : labelForSource(source);
}

function breakdownSummary(items: Array<{ label: string; count: number }>, empty: string) {
  if (!items.length) return empty;
  return items.slice(0, 3).map((item) => `${item.label} - ${item.count}`).join(" • ");
}

export default async function BookingFunnelPage({ params, searchParams }: { params: Promise<{ businessSlug: string }>; searchParams: Promise<{ range?: string; from?: string; to?: string; source?: string; month?: string; date?: string; includeAutomated?: string }> }) {
  const { businessSlug } = await params;
  const q = await searchParams;
  const { supabase, business, role } = await requireWorkspace(businessSlug);
  if (!canManageBusiness(role)) return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile} /><section className="epic3-content marketing-page"><div className="workspace-notice error">Only owners and administrators can view marketing analytics.</div></section></main>;
  const window = acquisitionDateRange(q.range, q.from, q.to, new Date(), business.timezone);
  // `window.to` is an exclusive timestamp for database queries. Keep the form on
  // the inclusive calendar day the customer chose so submitting never extends it.
  const reportFromDate = /^\d{4}-\d{2}-\d{2}$/.test(q.from ?? "") ? q.from! : dateInTimeZone(new Date(window.from), business.timezone);
  const reportToDate = /^\d{4}-\d{2}-\d{2}$/.test(q.to ?? "") ? q.to! : dateInTimeZone(new Date(), business.timezone);
  const includeAutomated = q.includeAutomated !== "0";
  const source = sourceOptions.includes((q.source ?? "all") as SourceFilter) ? (q.source ?? "all") as SourceFilter : "all";
  const previousWindowFrom = new Date(new Date(window.from).getTime() - (new Date(window.to).getTime() - new Date(window.from).getTime())).toISOString();
  const reportQueryStartedAt = Date.now();
  const [eventsResponse, spendBySource, campaignSpendResponse, inventoryResponse, bookingItemsResponse, snapshotsResponse, bookingsResponse, previousEventsResponse, previousBookingsResponse, websiteResponse, bookingSettingsResponse, paymentResponse, websiteRequestsResponse, estimatesResponse, invoicesResponse, googleConnectionResponse, googleCampaignsResponse, sessionsResponse, metaResourceResult] = await Promise.all([
    supabase.from("booking_funnel_events").select("event_name,event_key,occurred_at,attribution_session_id,booking_id,customer_id,inventory_item_id,service_id,invoice_id,booking_total_cents,amount_paid_cents,currency,metadata,booking_attribution_sessions(utm_source,utm_medium,utm_campaign,utm_content,utm_term,utm_id,first_referrer,first_landing_url,first_landing_path,gclid,gbraid,wbraid,fbclid)").eq("business_id", business.id).gte("occurred_at", window.from).lt("occurred_at", window.to),
    new MultiPlatformSpendProvider(supabase).getSpendBySource({ businessId: business.id, from: window.from, to: window.to }),
    supabase.from("business_ad_platform_daily_performance").select("campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend_amount").eq("business_id", business.id).eq("provider", "meta").gte("report_date", window.from.slice(0, 10)).lt("report_date", window.to.slice(0, 10)),
    supabase.from("inventory_items").select("id,name").eq("business_id", business.id).order("name"),
    supabase.from("booking_items").select("booking_id,inventory_item_id,rental_date,quantity,unit_price_cents,bookings!inner(created_at,business_id)").eq("bookings.business_id", business.id).gte("bookings.created_at", window.from).lt("bookings.created_at", window.to),
    supabase.from("booking_attribution_snapshots").select("booking_id,first_referrer,first_landing_url,first_landing_path,utm_source,utm_medium,utm_campaign,utm_content,utm_term,utm_id,gclid,gbraid,wbraid,fbclid").eq("business_id", business.id),
    supabase.from("bookings").select("id,status,total_cents,booking_attribution_snapshots(attribution_session_id,first_referrer,first_landing_url,first_landing_path,utm_source,utm_medium,utm_campaign,utm_content,utm_term,utm_id,gclid,gbraid,wbraid,fbclid)").eq("business_id", business.id).gte("created_at", window.from).lt("created_at", window.to),
    supabase.from("booking_funnel_events").select("event_name,event_key,occurred_at,attribution_session_id,booking_id,customer_id,inventory_item_id,service_id,invoice_id,booking_total_cents,amount_paid_cents,currency,metadata,booking_attribution_sessions(utm_source,utm_medium,utm_campaign,utm_content,utm_term,utm_id,first_referrer,first_landing_url,first_landing_path,gclid,gbraid,wbraid,fbclid)").eq("business_id", business.id).gte("occurred_at", previousWindowFrom).lt("occurred_at", window.from),
    supabase.from("bookings").select("id,status,total_cents,booking_attribution_snapshots(attribution_session_id,first_referrer,first_landing_url,first_landing_path,utm_source,utm_medium,utm_campaign,utm_content,utm_term,utm_id,gclid,gbraid,wbraid,fbclid)").eq("business_id", business.id).gte("created_at", previousWindowFrom).lt("created_at", window.from),
    supabase.from("business_website_settings").select("status,custom_domain,public_slug,request_service_enabled,booking_enabled").eq("business_id", business.id).maybeSingle(),
    supabase.from("booking_settings").select("enabled,public_slug").eq("business_id", business.id).maybeSingle(),
    supabase.from("business_payment_accounts").select("onboarding_status,charges_enabled,payouts_enabled,details_submitted").eq("business_id", business.id).eq("provider", "stripe").maybeSingle(),
    supabase.from("website_service_requests").select("id,lead_status,created_at").eq("business_id", business.id).order("created_at", { ascending: true }).limit(20),
    supabase.from("estimates").select("id,status,created_at,updated_at").eq("business_id", business.id).eq("is_deleted", false).in("status", ["sent", "viewed"]).order("created_at", { ascending: true }).limit(20),
    supabase.from("invoices").select("id,balance_due_cents,due_date,status").eq("business_id", business.id).eq("is_deleted", false).gt("balance_due_cents", 0).lt("due_date", new Date().toISOString().slice(0, 10)).limit(50),
    supabase.from("business_google_ads_connections").select("status,google_ads_customer_id").eq("business_id", business.id).maybeSingle(),
    supabase.from("business_google_ads_campaigns").select("id,status,campaign_name,google_campaign_id,google_campaign_status,google_campaign_primary_status,google_campaign_primary_status_reasons").eq("business_id", business.id),
    supabase.from("booking_attribution_sessions").select("id,session_started_at,utm_source,utm_medium,utm_campaign,utm_content,utm_term,utm_id,first_referrer,first_landing_url,first_landing_path,gclid,gbraid,wbraid,fbclid,browser,operating_system,device_type,first_interaction_type,first_interaction_label,first_interaction_identifier,first_interaction_path,first_interaction_at,time_to_first_interaction_milliseconds,meaningful_interaction_count,automated_classification,automated_classification_reason,total_session_duration_seconds,engaged_duration_seconds,total_session_duration_milliseconds,engaged_duration_milliseconds,duration_source,duration_final_flush_received,page_count,engaged_page_count").eq("business_id", business.id).gte("last_seen_at", window.from).lt("last_seen_at", window.to),
    loadMetaAttributionResources(supabase, business.id),
  ]);
  const metaPerformanceRows = metaResourceResult.rows;
  const reportQueryDurationMs = Date.now() - reportQueryStartedAt;
  if (eventsResponse.error) {
    return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile} /><section className="epic3-content marketing-page marketing-funnel-page"><header className="marketing-analytics-header"><div><span className="sv-kicker">Marketing analytics</span><h1>Website analytics</h1><p>See what customers are trying to rent, which dates they want, and which marketing sources are converting.</p><small>{business.name}</small></div></header><nav className="marketing-subnav" aria-label="Marketing sections"><Link href={`/app/${businessSlug}/marketing/funnel`} aria-current="page">Funnel</Link><Link href={`/app/${businessSlug}/marketing/discounts`}>Discounts</Link><Link href={`/app/${businessSlug}/marketing/google-ads`}>Google Ads</Link></nav><div className="workspace-notice error">Apply the marketing attribution funnel migration to view this report.</div></section></main>;
  }
  const events = ((eventsResponse.data ?? []) as FunnelEventRow[]).filter((row) => sourceMatches(row, source, metaPerformanceRows));
  const rawEventCount = (eventsResponse.data ?? []).length;
  const latestEventAt = ((eventsResponse.data ?? []) as Array<{ occurred_at?: string | null }>).reduce<string | null>((latest, row) => row.occurred_at && (!latest || row.occurred_at > latest) ? row.occurred_at : latest, null);
  const sessions = ((sessionsResponse.data ?? []) as Array<{
    id: string;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    utm_content?: string | null;
    utm_term?: string | null;
    utm_id?: string | null;
    first_referrer?: string | null;
    first_landing_url?: string | null;
    first_landing_path?: string | null;
    gclid?: string | null;
    gbraid?: string | null;
    wbraid?: string | null;
    fbclid?: string | null;
    total_session_duration_seconds?: number | null;
    engaged_duration_seconds?: number | null;
    total_session_duration_milliseconds?: number | null;
    engaged_duration_milliseconds?: number | null;
    duration_source?: "heartbeat" | "final_flush" | "inferred" | null;
    duration_final_flush_received?: boolean | null;
    page_count?: number | null;
    engaged_page_count?: number | null;
  }>).filter((row) => source === "all" || normalizeMarketingSource(row, metaPerformanceRows) === source);
  const landingEventSessionIds = new Set(events.filter((row) => ["landing_page_view", "landing_view"].includes(String(row.event_name))).map((row) => row.attribution_session_id).filter(Boolean));
  // Sessions are authoritative visit records even if optional detail-event insertion failed.
  const sessionVisitRows: FunnelEventRow[] = sessions.filter((session) => !landingEventSessionIds.has(session.id)).map((session) => ({ attribution_session_id: session.id, event_name: "landing_page_view", booking_attribution_sessions: session }));
  const allAttributedBookings = ((bookingsResponse.data ?? []) as Array<{ id: string; status: string | null; total_cents: number | null; booking_attribution_snapshots?: unknown }>).map((row) => ({
    booking_id: row.id,
    status: row.status,
    total_cents: row.total_cents,
    booking_attribution_snapshots: row.booking_attribution_snapshots as AttributedBookingRow["booking_attribution_snapshots"],
  }));
  const attributedBookings=allAttributedBookings.filter((row) => source === "all" || normalizeMarketingSource(Array.isArray(row.booking_attribution_snapshots) ? row.booking_attribution_snapshots[0] : row.booking_attribution_snapshots, metaPerformanceRows) === source);
  const report = attachSessionMetricsToSourceReport(
    buildSourcePerformanceReport([...events, ...sessionVisitRows], attributedBookings, source === "all" ? spendBySource : Object.fromEntries(marketingSources.map((key) => [key, key === source ? spendBySource[key] ?? null : null])) as Partial<Record<MarketingSource, number | null>>, metaPerformanceRows),
    sessions, metaPerformanceRows,
  );
  const gbpActionRows=buildGoogleBusinessProfileActionPerformanceReport([...events,...sessionVisitRows],attributedBookings);
  const organicProviderPerformance=buildOrganicProviderPerformanceReport([...events,...sessionVisitRows],attributedBookings);
  const organicProviderRows=organicProviders.map((provider)=>({provider,summary:organicProviderPerformance.find((row)=>row.provider===provider)?.summary??null}));
  const metaSpendRows = (campaignSpendResponse.data ?? []) as Array<{ campaign_id: string | null; campaign_name: string | null; adset_id: string | null; adset_name: string | null; ad_id: string | null; ad_name: string | null; spend_amount: number | string | null }>;
  const sessionQuality = buildSessionQualityReport(sessions, { includeAutomated, engagementThresholdMs: defaultSessionEngagementThresholdMs, metaPerformanceRows });
  const campaignPerformance = buildCampaignPerformanceReport({
    sessions,
    events: [...events, ...sessionVisitRows],
    bookings: attributedBookings,
    metaPerformanceRows,
    googleCampaignRows: ((googleCampaignsResponse.data ?? []) as Array<{ google_campaign_id: string | number | null; campaign_name: string | null }>),
  });
  const spendByCampaign = metaSpendRows.reduce<Record<string, number>>((totals, row) => {
    const campaign = row.campaign_name?.trim().toLowerCase();
    if (campaign) totals[campaign] = (totals[campaign] ?? 0) + Math.max(0, Math.round(Number(row.spend_amount ?? 0) * 100));
    return totals;
  }, {});
  const landingPageFunnel = buildLandingPageFunnelReport({ sessions, events: [...events, ...sessionVisitRows], bookings: attributedBookings, spendByCampaign });
  const sourceCheckoutFunnels = new Map([
    ...marketingSources.map((trafficSource) => [trafficSource, buildSourceCheckoutFunnelReport({ source: trafficSource, sessions, events: [...events, ...sessionVisitRows], bookings: attributedBookings, metaPerformanceRows })] as const),
  ]);
  const timedDurationSeconds = sessions.flatMap((session) => session.total_session_duration_milliseconds == null ? [] : [Math.max(0, Number(session.total_session_duration_milliseconds) / 1000)]).sort((left, right) => left - right);
  const timingDiagnostics = {
    available: timedDurationSeconds.length,
    unavailable: sessions.length - timedDurationSeconds.length,
    min: timedDurationSeconds[0] ?? null,
    average: timedDurationSeconds.length ? timedDurationSeconds.reduce((sum, value) => sum + value, 0) / timedDurationSeconds.length : null,
    median: timedDurationSeconds.length ? timedDurationSeconds[Math.floor(timedDurationSeconds.length / 2)] ?? null : null,
    max: timedDurationSeconds.at(-1) ?? null,
    finalFlushMissing: sessions.filter((session) => session.total_session_duration_milliseconds != null && !session.duration_final_flush_received).length,
  };
  const itemNames = new Map(((inventoryResponse.data ?? []) as Array<{ id: string; name: string | null }>).map((item) => [item.id, item.name?.trim() || "Rental item"]));
  const bookingSourceMap = new Map<string, MarketingSource>();
  for (const row of snapshotsResponse.data ?? []) {
    const normalized = normalizeMarketingSource(row as any, metaPerformanceRows);
    if (source === "all" || normalized === source) bookingSourceMap.set(String((row as { booking_id?: string | null }).booking_id ?? ""), normalized);
  }
  const bookingItems = ((bookingItemsResponse.data ?? []) as BookingItemRow[]).filter((row) => source === "all" || bookingSourceMap.has(String(row.booking_id ?? "")));
  const requestedDates = buildRequestedDateAnalytics(events, itemNames, metaPerformanceRows);
  const itemRows = buildRentalItemAnalytics(events, bookingItems, bookingSourceMap, itemNames);
  const selectedMonth = /^\d{4}-\d{2}$/.test(q.month ?? "") ? q.month! : (requestedDates.busiestDate?.slice(0, 7) ?? monthValue(new Date()));
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(q.date ?? "") ? q.date! : (requestedDates.busiestDate ?? `${selectedMonth}-01`);
  const dateDetail = requestedDates.detail(selectedDate);
  const previousEvents = ((previousEventsResponse.data ?? []) as FunnelEventRow[]).filter((row) => sourceMatches(row, source, metaPerformanceRows));
  const previousAttributedBookings = ((previousBookingsResponse.data ?? []) as Array<{ id: string; status: string | null; total_cents: number | null; booking_attribution_snapshots?: unknown }>).map((row) => ({
    booking_id: row.id,
    status: row.status,
    total_cents: row.total_cents,
    booking_attribution_snapshots: row.booking_attribution_snapshots as AttributedBookingRow["booking_attribution_snapshots"],
  })).filter((row) => source === "all" || normalizeMarketingSource(Array.isArray(row.booking_attribution_snapshots) ? row.booking_attribution_snapshots[0] : row.booking_attribution_snapshots, metaPerformanceRows) === source);
  const previousReport = buildSourcePerformanceReport(previousEvents, previousAttributedBookings, {}, metaPerformanceRows);
  const previousTotals = buildPreviousPeriodReport(previousReport.summaries);
  const totalBookings = report.summaries.reduce((sum, row) => sum + (row.detailedCounts.booking_completed ?? 0), 0);
  const trafficSourceRows = report.summaries.map((row) => ({ key: row.source, label: labelForSource(row.source), campaignSource: row.source, visits: row.visits, itemViews: row.engaged, bookingStarts: row.detailedCounts.booking_start ?? 0, bookings: row.detailedCounts.booking_completed ?? 0, revenueCents: row.revenueCents }));
  const adPlatformStatuses = await loadAdPlatformStatuses(supabase, business.id, window.from, window.to, spendBySource.google_ads ?? null);
  const paidTotal=totalPaidEconomics(buildSourcePerformanceReport([],allAttributedBookings,{},metaPerformanceRows).summaries,adPlatformStatuses);
  const roasCard = buildRoasCardModel({ statuses: adPlatformStatuses, attributedRevenueCents: paidTotal.revenueCents, roas: paidTotal.roas });
  // Keep paid platforms visible even when spend has no associated onsite activity.
  for(const [key,label] of [["google_ads","Google Ads"],["meta_ads","Meta Ads"]] as const){
    const visible=source==="all"||source===key;
    if(visible&&!trafficSourceRows.some(row=>row.key===key))trafficSourceRows.push({key,label,campaignSource:key,visits:0,itemViews:0,bookingStarts:0,bookings:0,revenueCents:0});
  }
  const aggregatedStepCounts = new Map<string, number>();
  for (const summary of report.summaries) {
    for (const step of summary.stepCounts) {
      aggregatedStepCounts.set(step.key, (aggregatedStepCounts.get(step.key) ?? 0) + step.count);
    }
  }
  const journeySteps = [
    ["landing_view", "Visits"],
    ["engaged", "Item / service views"],
    ["booking_start", "Booking starts"],
    ["availability_check", "Availability checks"],
    ["date_selected", "Date selections"],
    ["item_added", "Items added"],
    ["checkout_started", "Checkout starts"],
    ["booking_completed", "Bookings"],
  ] as const;
  const journeyStepLookup = new Map(journeySteps.map(([key, label], index) => {
    const count = aggregatedStepCounts.get(key) ?? 0;
    const previousKey = index > 0 ? journeySteps[index - 1]?.[0] ?? null : null;
    const previousCount = previousKey ? (aggregatedStepCounts.get(previousKey) ?? 0) : 0;
    const progressFromPrevious = index === 0 ? null : (previousCount > 0 ? count / previousCount : null);
    const dropOffRate = index === 0 ? null : (previousCount > 0 ? Math.max(0, 1 - count / previousCount) : null);
    return [key, { key, label, count, progressFromPrevious, dropOffRate }] as const;
  }));
  const cells = buildRequestedDateCells(selectedMonth, requestedDates.totals);

  const googleCampaignSnapshots = ((googleCampaignsResponse.data ?? []) as Array<{
    google_campaign_id?: string | number | null;
    google_campaign_status?: string | null;
    google_campaign_primary_status?: string | null;
    google_campaign_primary_status_reasons?: string[] | null;
  }>).filter((campaign) => campaign.google_campaign_id).map((campaign) => ({
      status: campaign.google_campaign_status ?? null,
      primaryStatus: campaign.google_campaign_primary_status ?? null,
      primaryStatusReasons: Array.isArray(campaign.google_campaign_primary_status_reasons) ? campaign.google_campaign_primary_status_reasons.map(String) : [],
      impressions: 0,
      clicks: 0,
      ctr: null,
      averageCpcMicros: null,
      conversions: 0,
    }));

  async function loadInsights() {
    return resolveAiInsights({
      businessId: business.id,
      businessSlug,
      industryProfile: business.industry_profile ?? null,
      businessName: business.name ?? null,
      businessEmail: business.email ?? null,
      businessPhone: business.phone ?? null,
      addressLine1: business.address_line1 ?? null,
      city: business.city ?? null,
      state: business.state ?? null,
      timezone: business.timezone ?? null,
      website: {
        status: (websiteResponse.data as { status?: string | null } | null)?.status ?? null,
        customDomain: (websiteResponse.data as { custom_domain?: string | null } | null)?.custom_domain ?? null,
        publicSlug: (websiteResponse.data as { public_slug?: string | null } | null)?.public_slug ?? null,
        requestServiceEnabled: Boolean((websiteResponse.data as { request_service_enabled?: boolean | null } | null)?.request_service_enabled),
        bookingEnabled: Boolean((websiteResponse.data as { booking_enabled?: boolean | null } | null)?.booking_enabled),
      },
      booking: {
        enabled: Boolean((bookingSettingsResponse.data as { enabled?: boolean | null } | null)?.enabled),
        publicSlug: (bookingSettingsResponse.data as { public_slug?: string | null } | null)?.public_slug ?? null,
      },
      payments: paymentResponse.data ? {
        onboardingStatus: (paymentResponse.data as { onboarding_status?: string | null }).onboarding_status ?? null,
        chargesEnabled: Boolean((paymentResponse.data as { charges_enabled?: boolean | null }).charges_enabled),
        payoutsEnabled: Boolean((paymentResponse.data as { payouts_enabled?: boolean | null }).payouts_enabled),
        detailsSubmitted: Boolean((paymentResponse.data as { details_submitted?: boolean | null }).details_submitted),
      } : null,
      googleAds: {
        connected: Boolean((googleConnectionResponse.data as { status?: string | null } | null)?.status && (googleConnectionResponse.data as { status?: string | null } | null)?.status !== "disconnected"),
        campaignCount: ((googleCampaignsResponse.data ?? []) as unknown[]).length,
        campaigns: googleCampaignSnapshots,
      },
      funnel: {
        visits: report.totals.visits,
        engaged: report.totals.engaged,
        bookingStarts: aggregatedStepCounts.get("booking_start") ?? 0,
        checkoutStarts: aggregatedStepCounts.get("checkout_started") ?? 0,
        leads: aggregatedStepCounts.get("lead_submitted") ?? 0,
        bookings: totalBookings,
        revenueCents: report.totals.revenueCents,
        periodLabel: sourceLabel(source).toLowerCase() === "all traffic" ? "this reporting window" : `this reporting window from ${sourceLabel(source)}`,
        previousVisits: previousTotals.visits,
        previousBookingStarts: previousTotals.bookingStarts,
        previousBookings: previousTotals.bookings,
      },
      websiteLeads: {
        newCount: ((websiteRequestsResponse.data ?? []) as Array<{ lead_status?: string | null }>).filter((row) => (row.lead_status ?? "new") === "new").length,
        oldestNewCreatedAt: (((websiteRequestsResponse.data ?? []) as Array<{ lead_status?: string | null; created_at?: string | null }>).find((row) => (row.lead_status ?? "new") === "new")?.created_at ?? null),
      },
      estimates: {
        awaitingResponseCount: (estimatesResponse.data ?? []).length,
        oldestAwaitingResponseAt: ((estimatesResponse.data ?? []) as Array<{ created_at?: string | null }>)[0]?.created_at ?? null,
      },
      invoices: {
        overdueCount: (invoicesResponse.data ?? []).length,
        overdueAmountCents: ((invoicesResponse.data ?? []) as Array<{ balance_due_cents?: number | null }>).reduce((sum, row) => sum + Math.max(0, Number(row.balance_due_cents ?? 0)), 0),
      },
    });
  }
  const aiInsights = await loadInsights();

  return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile} /><section className="epic3-content marketing-page marketing-funnel-page">
    <header className="marketing-analytics-header"><div><span className="sv-kicker">Marketing analytics</span><h1>Website analytics</h1><p>See what customers are trying to rent, when they need it, and which sources are producing bookings.</p><small>{business.name}</small></div></header>
    <nav className="marketing-subnav" aria-label="Marketing sections"><Link href={`/app/${businessSlug}/marketing/funnel`} aria-current="page">Funnel</Link><Link href={`/app/${businessSlug}/marketing/discounts`}>Discounts</Link><Link href={`/app/${businessSlug}/marketing/google-ads`}>Google Ads</Link><Link href={`/app/${businessSlug}/marketing/meta-ads`}>Meta Ads</Link><Link href={`/app/${businessSlug}/marketing/seo`}>Local SEO</Link></nav>
    <section className="workspace-panel marketing-filter-panel">
      <form className="marketing-filter-bar" method="get">
        <label>From<input type="date" name="from" defaultValue={reportFromDate} /></label>
        <label>To<input type="date" name="to" defaultValue={reportToDate} /></label>
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

    <details className="workspace-panel marketing-attribution-note">
      <summary>Analytics diagnostics</summary>
      <p>Window: {window.from} to {window.to} ({business.timezone}). Business filter: {business.id}. Raw events: {rawEventCount}. Events after source filter: {events.length}. Sessions: {sessions.length}. Session-backed visits: {sessionVisitRows.length}. Latest event: {latestEventAt ?? "none"}. Query duration: {reportQueryDurationMs}ms.</p>
      <p>Timing diagnostics: {timingDiagnostics.available} timed, {timingDiagnostics.unavailable} unavailable, min {timingDiagnostics.min ?? "—"}s, median {timingDiagnostics.median ?? "—"}s, average {timingDiagnostics.average == null ? "—" : timingDiagnostics.average.toFixed(1)}s, max {timingDiagnostics.max ?? "—"}s, final flush missing {timingDiagnostics.finalFlushMissing}.</p>
    </details>

    <section className="marketing-kpi-grid">
      <article className="workspace-panel"><span>Visits</span><strong>{report.totals.visits}</strong><small>Attributed session visits</small></article>
      <article className="workspace-panel"><span>Engaged visitors</span><strong>{report.totals.engaged}</strong><small>Viewed an offering or entered booking</small></article>
      <article className="workspace-panel"><span>Booking starts</span><strong>{aggregatedStepCounts.get("booking_start") ?? 0}</strong><small>Visitors entering the booking flow</small></article>
      <article className="workspace-panel"><span>Bookings</span><strong>{totalBookings}</strong><small>Completed bookings during this period</small></article>
      <article className="workspace-panel"><span>Revenue</span><strong>{money(report.totals.revenueCents)}</strong><small>Attributed booking value</small></article>
      <article className="workspace-panel"><span>Ad spend / ROAS</span><strong>{roasCard.headline}</strong><small>{roasCard.detail}</small></article>
    </section>

    <section className="workspace-panel marketing-ai-panel">
      <header><div><h2>AI Insights</h2><p>Servonas looks across your business and highlights what deserves your attention.</p></div></header>
      <div className="marketing-ai-insights-head">
        <strong>{aiInsights.focus.length} thing{aiInsights.focus.length === 1 ? "" : "s"} to focus on</strong>
        <small>{aiInsights.cache.hit ? "Using cached insight snapshot" : "Fresh insight snapshot"} · Rule engine v1</small>
      </div>
      <div className="marketing-ai-insight-grid">
        {aiInsights.focus.map((insight) => <article className={`marketing-ai-insight-card is-${insight.priority}`} key={insight.id}>
          <header>
            <span className={`marketing-ai-insight-badge is-${insight.priority}`}>{insight.priority === "positive" ? "Good news" : insight.priority === "high" ? "High priority" : insight.priority === "medium" ? "Needs attention" : "Monitoring"}</span>
            <strong>{insight.title}</strong>
          </header>
          <p className="marketing-ai-insight-summary">{insight.simpleSummary}</p>
          <dl className="marketing-ai-insight-copy">
            <div><dt>Why this matters</dt><dd>{insight.whyItMatters}</dd></div>
            <div><dt>Next step</dt><dd>{insight.recommendedAction}</dd></div>
          </dl>
          {insight.educationalExplanation ? <details className="marketing-ai-insight-explanation"><summary>What this means</summary><p>{insight.educationalExplanation}</p></details> : null}
          <footer className="marketing-ai-insight-footer">
            <span className="marketing-ai-insight-source">{insight.source.replaceAll("_", " ")}</span>
            <Link className={`sv-button ${insight.priority === "high" ? "" : "sv-secondary"}`} href={insight.actionHref}>{insight.actionLabel}</Link>
          </footer>
          {role === "platform_admin" && <details className="marketing-ai-insight-debug">
            <summary>Insight diagnostics</summary>
            <pre>{JSON.stringify({ type: insight.type, source: insight.source, priority: insight.priority, confidence: insight.confidence, evidence: insight.evidence, ruleVersion: insight.ruleVersion, aiGenerated: insight.aiGenerated }, null, 2)}</pre>
          </details>}
        </article>)}
      </div>
      {aiInsights.more.length ? <details className="marketing-ai-more">
        <summary>More insights</summary>
        <div className="marketing-ai-insight-grid">
          {aiInsights.more.map((insight) => <article className={`marketing-ai-insight-card is-${insight.priority}`} key={insight.id}>
            <header>
              <span className={`marketing-ai-insight-badge is-${insight.priority}`}>{insight.priority === "positive" ? "Good news" : insight.priority === "high" ? "High priority" : insight.priority === "medium" ? "Needs attention" : "Monitoring"}</span>
              <strong>{insight.title}</strong>
            </header>
            <p className="marketing-ai-insight-summary">{insight.simpleSummary}</p>
            <footer className="marketing-ai-insight-footer">
              <span className="marketing-ai-insight-source">{insight.source.replaceAll("_", " ")}</span>
              <Link className="sv-button sv-secondary" href={insight.actionHref}>{insight.actionLabel}</Link>
            </footer>
          </article>)}
        </div>
      </details> : null}
    </section>

    <section className="workspace-panel">
      <header><div><h2>Customer journey</h2><p>Track how visitors move from visit to booking and revenue.</p></div></header>
      <div className="marketing-sources-table">
        <div><b>Step</b><b>Count</b><b>Progress</b><b>Drop-off</b></div>
        {journeySteps.map(([key, label], index) => {
          const step = journeyStepLookup.get(key) ?? { count: 0, progressFromPrevious: index === 0 ? null : null, dropOffRate: index === 0 ? null : null };
          return <div key={key}><span>{label}</span><span>{step.count}</span><span>{percent(step.progressFromPrevious)}</span><span>{percent(step.dropOffRate)}</span></div>;
        })}
        <div><span>Revenue</span><span>{money(report.totals.revenueCents)}</span><span>—</span><span>—</span></div>
      </div>
    </section>

    <section className="workspace-panel">
      <header><div><h2>Time on site</h2><p>Active time while the page was visible and in use during the selected period.</p></div></header>
      <div className="marketing-session-quality-header">
        <div className="marketing-session-quality-metrics">
          <article><span>Total sessions</span><strong>{sessionQuality.visibleSessions}</strong><small>{includeAutomated ? `${sessionQuality.totalSessions} including likely automated traffic` : "Likely automated traffic excluded from the metrics below"}</small></article>
          <article><span>Verified activity</span><strong>{sessionQuality.verifiedSessions}</strong><small>{sessionQuality.unverifiedSessions} session{sessionQuality.unverifiedSessions === 1 ? "" : "s"} still lack client-side timing confirmation.</small></article>
          <article><span>Engaged sessions</span><strong>{sessionQuality.engagedSessions}</strong><small>Meaningful interaction, another page, or at least {Math.round(defaultSessionEngagementThresholdMs / 1000)} seconds of active time.</small></article>
          <article><span>Quick exits</span><strong>{sessionQuality.quickExits}</strong><small>Short likely-human visits with no meaningful interaction and no second page view.</small></article>
          <article><span>Likely automated sessions</span><strong>{sessionQuality.likelyAutomatedSessions}</strong><small>Classified from crawler, preview, and prefetch signals.</small></article>
          <article><span>Median active session duration</span><strong>{ms(sessionQuality.medianActiveSessionDurationMs)}</strong><small>Visible-tab active time only.</small></article>
          <article><span>Median time to first interaction</span><strong>{ms(sessionQuality.medianTimeToFirstInteractionMs)}</strong><small>How quickly visitors first click, tap, start a form, or begin booking.</small></article>
        </div>
        <form className="marketing-session-quality-toggle" method="get">
          <input type="hidden" name="from" value={reportFromDate} />
          <input type="hidden" name="to" value={reportToDate} />
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="month" value={selectedMonth} />
          <input type="hidden" name="date" value={selectedDate} />
          <label><input type="checkbox" name="includeAutomated" value="1" defaultChecked={includeAutomated} /> Include likely automated traffic</label>
          <button className="sv-button sv-secondary sv-small">Update</button>
        </form>
      </div>
      <div className="marketing-session-insight-card">
        <div>
          <span className="sv-kicker">Servonas insight</span>
          <strong>{sessionQuality.primaryInsight ?? "Visitors are generating a usable mix of engagement data. Use the buckets below to see where short sessions are coming from."}</strong>
          {sessionQuality.supportingObservation ? <p>{sessionQuality.supportingObservation}</p> : null}
        </div>
      </div>
      <div className="marketing-session-bucket-list">
        {sessionQuality.buckets.map((bucket) => <details className="marketing-session-bucket" key={bucket.key}>
          <summary>
            <span><strong>{bucket.label}</strong><small>{bucket.count} sessions · {Math.round(bucket.percentage * 100)}%</small></span>
            <small>{bucket.automatedCount ? `Likely automated traffic: ${bucket.automatedCount}` : "View details"}</small>
          </summary>
          <div className="marketing-session-bucket-detail">
            <div className="marketing-session-bucket-grid">
              <article><h3>Source breakdown</h3><div className="marketing-conversion-list">{bucket.sourceBreakdown.length ? bucket.sourceBreakdown.map((entry) => <div key={entry.key}><dt>{entry.label}</dt><dd>{entry.count} · {Math.round(entry.percentage * 100)}%</dd></div>) : <div><dt>No attribution yet</dt><dd>These sessions do not have enough source data yet.</dd></div>}</div></article>
              <article><h3>Landing pages</h3><div className="marketing-conversion-list">{bucket.landingPages.length ? bucket.landingPages.map((entry) => <div key={entry.path}><dt>{entry.path}</dt><dd>{entry.count}</dd></div>) : <div><dt>No landing pages</dt><dd>Historical sessions are missing landing-page detail.</dd></div>}</div></article>
              <article><h3>Device mix</h3><div className="marketing-conversion-list">{bucket.deviceBreakdown.length ? bucket.deviceBreakdown.map((entry) => <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.count} · {Math.round(entry.percentage * 100)}%</dd></div>) : <div><dt>Unknown</dt><dd>No device detail yet.</dd></div>}</div></article>
              <article><h3>Campaigns</h3><div className="marketing-conversion-list">{bucket.campaignBreakdown.length ? bucket.campaignBreakdown.map((entry) => <div key={`${entry.name}-${entry.campaignId ?? "none"}-${entry.source}`}><dt title={entry.isMetaId && entry.campaignId ? `Meta ID: ${entry.campaignId}` : undefined}>{entry.name}</dt><dd>{entry.source}{entry.isMetaId && entry.campaignId ? ` · Meta ID: ${entry.campaignId}` : ""} · {entry.count}</dd></div>) : <div><dt>No campaign detail</dt><dd>Campaign values appear when UTM or click-id data is available.</dd></div>}</div></article>
              <article><h3>Verification</h3><div className="marketing-conversion-list">{bucket.verificationBreakdown.length ? bucket.verificationBreakdown.map((entry) => <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.count}</dd></div>) : <div><dt>No timing detail</dt><dd>Servonas has not observed client-side timing data yet.</dd></div>}</div></article>
            </div>
            {bucket.insight ? <div className="marketing-session-bucket-note"><strong>{bucket.insight}</strong>{bucket.observation ? <p>{bucket.observation}</p> : null}</div> : null}
            <details className="marketing-session-table-wrap">
              <summary>View sessions</summary>
              <div className="marketing-session-table">
                <div><b>Timestamp</b><b>Source</b><b>Campaign</b><b>Landing page</b><b>Device</b><b>Browser</b><b>Active time</b><b>Time to first interaction</b><b>First interaction</b><b>Pages viewed</b><b>Engagement</b><b>Verification</b><b>Automated</b></div>
                {bucket.details.map((detail) => {const campaignLabel=detail.metaAttributionName?.name ?? detail.attribution.campaignName ?? detail.campaignName ?? detail.campaignId ?? "—";const rawMetaId=detail.metaAttributionName?.rawId;return <div key={detail.id}><span>{detail.startedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short", timeZone: business.timezone }).format(new Date(detail.startedAt)) : "—"}</span><span>{detail.attribution.platformLabel ? `${detail.attribution.providerLabel} • ${detail.attribution.platformLabel}` : detail.sourceLabel}</span><span title={rawMetaId ? `Meta ID: ${rawMetaId}` : undefined}>{campaignLabel}{rawMetaId ? <small>Meta ID: {rawMetaId}</small> : null}</span><span>{detail.landingPage}</span><span>{detail.device}</span><span>{detail.browser}</span><span>{ms(detail.sessionLengthMs)}</span><span>{ms(detail.timeToFirstInteractionMs, "—")}</span><span>{detail.firstInteractionLabel ?? detail.firstInteraction ?? "—"}</span><span>{detail.pagesViewed}</span><span>{detail.engagementClassification.replaceAll("_", " ")}</span><span>{detail.verificationStatus === "verified_activity" ? "Verified activity" : "Unverified activity"}</span><span>{detail.automatedClassification.replaceAll("_", " ")}</span></div>;})}
              </div>
            </details>
          </div>
        </details>)}
      </div>
      <div className="marketing-session-landing-panel">
        <header><div><h3>Landing page performance</h3><p>Follow each first-touch landing page from session through completed booking revenue.</p></div></header>
        <div className="marketing-sources-table marketing-session-landing-table"><div><b>Landing page</b><b>Sessions</b><b>CTA clicks</b><b>CTA rate</b><b>Booking visits</b><b>Item selections</b><b>Checkout starts</b><b>Bookings</b><b>Conversion</b><b>Revenue</b><b>Revenue / session</b><b>CAC</b><b>ROAS</b></div>{landingPageFunnel.map((row) => <details className="marketing-landing-checkout" key={row.path}><summary><span>{row.path}</span><span>{row.sessions}</span><span>{row.ctaClicks}</span><span>{percent(row.ctaRate)}</span><span>{row.bookingPageVisits}</span><span>{row.itemSelections}</span><span>{row.checkoutStarts>0?<><b>{row.checkoutStarts}</b><i aria-hidden="true">⌄</i></>:0}</span><span>{row.completedBookings}</span><span>{percent(row.bookingConversionRate)}</span><span>{money(row.revenueCents)}</span><span>{money(row.revenuePerSessionCents)}</span><span>{row.cacCents == null ? "—" : money(row.cacCents)}</span><span>{row.roas == null ? "—" : `${row.roas.toFixed(2)}×`}</span></summary>{row.checkoutStarts>0?<div className="marketing-checkout-drilldown"><strong>Checkout activity</strong><p className="marketing-checkout-reconciliation">{checkoutActivityHelp}</p>{checkoutSteps.some(([key])=>key==="checkout_addons_decision"?(row.checkoutSteps.checkout_addons_skipped??0)+(row.checkoutSteps.checkout_addons_added??0)>0:(row.checkoutSteps[key]??0)>0)?<div>{checkoutSteps.map(([key,label])=>{const count=key==="checkout_addons_decision"?(row.checkoutSteps.checkout_addons_skipped??0)+(row.checkoutSteps.checkout_addons_added??0):(row.checkoutSteps[key]??0);return <span key={key}><b>{label}</b><em>{count}</em>{key==="checkout_addons_decision"&&<small>{row.checkoutSteps.checkout_addons_skipped??0} skipped · {row.checkoutSteps.checkout_addons_added??0} added</small>}</span>;})}</div>:<p>No checkout-step data yet.</p>}{row.deliveryFeeAnalysis?<aside className="marketing-delivery-fee-analysis"><strong>Delivery fee analysis</strong><span>$0 delivery: {row.deliveryFeeAnalysis.zeroFeeSessions} · Terms accepted: {percent(row.deliveryFeeAnalysis.zeroFeeTermsAcceptedRate)}</span><span>Delivery fee: {row.deliveryFeeAnalysis.paidFeeSessions} · Avg. {money(row.deliveryFeeAnalysis.averagePaidFeeCents)} · Terms accepted: {percent(row.deliveryFeeAnalysis.paidFeeTermsAcceptedRate)}</span></aside>:null}</div>:null}</details>)}</div>
      </div>
    </section>

    <section className="workspace-panel marketing-sources-panel">
      <header><div><h2>Traffic source performance</h2><p>Choose a traffic source above to update the funnel, requested rental dates, most-clicked rentals, bookings, revenue, and insights.</p></div></header>
      <p className="muted">Google Business Profile uses explicit first-touch UTM tags to connect visits, onsite behavior, bookings, and revenue. Organic search attribution is separate from Search Console impressions, clicks, CTR, position, queries, and pages; a tagged page in Search Console does not connect a query to a specific session. Google Ads combines paid ad metrics with onsite attribution.</p>
      <p className="muted">Total revenue includes every displayed source. Total paid metrics cover Google Ads and Meta Ads for the selected dates, regardless of the traffic-source filter. Unavailable spend is not treated as zero.</p>
      <p className="muted">Meta Ads requires explicit paid tags or a matched Meta resource ID. Organic Social includes explicitly non-paid Facebook/Instagram traffic. Meta — unspecified has Meta origin evidence but no reliable paid or organic designation. Only Meta Ads receives Meta spend and contributes to paid ROAS. Campaign/resource rows are separate attribution buckets, not nested totals.</p>
      {!metaResourceResult.available?<p className="muted">Meta resource lookup is unavailable. Only explicit paid tags can establish Meta Ads until the lookup succeeds.</p>:null}
      <div className="marketing-sources-table marketing-traffic-sources-table"><div><b>Source</b><b>Visits</b><b>Item views</b><b>Booking starts</b><b>Bookings</b><b>Revenue</b><b>Ad spend</b><b title={paidEconomicsHelp.roas} tabIndex={0}>ROAS ⓘ</b><b title={paidEconomicsHelp.costPerBooking} tabIndex={0}>Cost / booking ⓘ</b></div>{trafficSourceRows.map((row) => {const campaigns=(["organic","google_business_profile","organic_social","meta_unspecified"].includes(row.key))?[]:campaignPerformance.filter((campaign) => campaign.source === row.campaignSource && (row.key!=="meta_ads"||campaign.name!=="Unattributed"));const sourceKey=row.campaignSource==="meta_ads"?"meta_ads":row.campaignSource;const funnel=sourceCheckoutFunnels.get(sourceKey);const economics=sourcePaidEconomics(row.key,row.revenueCents,row.bookings,adPlatformStatuses);const paid=row.key==="google_ads"||row.key==="meta_ads";return <details className="marketing-traffic-source" key={row.key} name="traffic-source"><summary><span>{row.label}<i aria-hidden="true">⌄</i></span><span>{row.visits}</span><span>{row.itemViews}</span><span>{row.bookingStarts}</span><span>{row.bookings}</span><span>{money(row.revenueCents)}</span><span>{economics.spendCents===null?(paid?"Unavailable":"—"):money(economics.spendCents)}</span><span title={paidEconomicsHelp.roas}>{formatPaidRoas(economics.roas)}</span><span title={paidEconomicsHelp.costPerBooking}>{economics.costPerBookingCents===null?"—":money(economics.costPerBookingCents)}</span></summary>{funnel?<CheckoutFunnelDrilldown funnel={funnel}/>:null}{row.key==="organic"?<div className="marketing-campaign-drilldown"><div><b>Search engine</b><b>Visits</b><b>Item views</b><b>Booking starts</b><b>Bookings</b><b>Revenue</b></div>{organicProviderRows.map(({provider,summary})=><div key={provider}><span>{labelForOrganicProvider(provider)}</span><span>{summary?.visits??0}</span><span>{summary?.engaged??0}</span><span>{summary?.detailedCounts.booking_start??0}</span><span>{summary?.detailedCounts.booking_completed??0}</span><span>{money(summary?.revenueCents??0)}</span></div>)}</div>:null}{row.key==="google_business_profile"?<div className="marketing-campaign-drilldown"><div><b>Link / action</b><b>Visits</b><b>Item views</b><b>Booking starts</b><b>Bookings</b><b>Revenue</b></div>{gbpActionRows.map(({action,summary})=><div key={action}><span>{labelForGoogleBusinessProfileAction(action)}</span><span>{summary?.visits??0}</span><span>{summary?.engaged??0}</span><span>{summary?.detailedCounts.booking_start??0}</span><span>{summary?.bookings??0}</span><span>{money(summary?.revenueCents??0)}</span></div>)}</div>:null}{campaigns.length?<div className="marketing-campaign-drilldown"><div><b>Campaign / resource</b><b>Visits</b><b>Item views</b><b>Booking starts</b><b>Bookings</b><b>Revenue</b></div>{campaigns.map((campaign) => {const level=campaign.resourceLevel===null?null:campaign.resourceLevel==="adset"?"Ad Set":campaign.resourceLevel[0].toUpperCase()+campaign.resourceLevel.slice(1),parent=campaign.resourceLevel&&campaign.resourceLevel!=="campaign"?(campaign.campaignName??"Campaign unavailable"):null;return <div key={`${campaign.resourceLevel??"utm"}-${campaign.name}-${campaign.rawId ?? "none"}`}><span title={campaign.isMetaId && campaign.rawId ? `Meta ID: ${campaign.rawId}` : undefined}>{parent?<><strong>{parent}</strong><small>{level}: {campaign.name}</small></>:campaign.name}{level&&<small>{level}{campaign.isMetaId&&campaign.rawId?` · Meta ID: ${campaign.rawId}`:""}</small>}</span><span>{campaign.visits}</span><span>{campaign.itemViews}</span><span>{campaign.bookingStarts}</span><span>{campaign.bookings}</span><span>{money(campaign.revenueCents)}</span></div>;})}</div>:null}</details>;})}<div><strong>Total</strong><strong>{report.totals.visits}</strong><strong>{report.totals.engaged}</strong><strong>{report.summaries.reduce((sum, row) => sum + (row.detailedCounts.booking_start ?? 0), 0)}</strong><strong>{totalBookings}</strong><strong>{money(report.totals.revenueCents)}</strong><strong>{paidTotal.spendCents===null?"Unavailable":money(paidTotal.spendCents)}</strong><strong title={paidEconomicsHelp.totalRoas} tabIndex={0}><small>Paid ROAS</small>{formatPaidRoas(paidTotal.roas)}</strong><strong title={paidEconomicsHelp.totalCostPerBooking} tabIndex={0}><small>Paid cost / booking</small>{paidTotal.costPerBookingCents===null?"—":money(paidTotal.costPerBookingCents)}</strong></div></div>
    </section>

    <section className="marketing-kpi-grid" aria-label="Paid ad platform summary">
      {adPlatformStatuses.map((status) => <article className="workspace-panel" key={status.provider}><span>{status.providerLabel}</span><strong>{availablePaidSpend(status)===null?"Unavailable":money(availablePaidSpend(status))}</strong><small>{availablePaidSpend(status)===null?status.state.replaceAll("_"," "):status.provider === "google_ads" ? `Actual spend for selected dates${status.lastSuccessfulSyncAt ? ` · Last sync ${new Date(status.lastSuccessfulSyncAt).toLocaleString()}` : ""}` : status.state === "connected_with_data" ? `Last sync ${status.lastSuccessfulSyncAt ? new Date(status.lastSuccessfulSyncAt).toLocaleString() : "available"}` : status.state.replaceAll("_"," ")}</small></article>)}
      <article className="workspace-panel"><span>Total paid ad spend</span><strong>{paidTotal.spendCents===null?"Unavailable":money(paidTotal.spendCents)}</strong><small>Actual Google Ads + Meta Ads spend for selected dates</small></article>
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
            <Link href={`/app/${businessSlug}/marketing/funnel?${queryString({ from: reportFromDate, to: reportToDate, source, month: shiftMonth(selectedMonth, -1), date: selectedDate })}`} aria-label="Previous month">‹</Link>
            <h2>{monthLabel(selectedMonth)}</h2>
            <Link href={`/app/${businessSlug}/marketing/funnel?${queryString({ from: reportFromDate, to: reportToDate, source, month: shiftMonth(selectedMonth, 1), date: selectedDate })}`} aria-label="Next month">›</Link>
          </div>
          <form className="marketing-month-jump" method="get">
            <input type="hidden" name="from" value={reportFromDate} />
            <input type="hidden" name="to" value={reportToDate} />
            <input type="hidden" name="source" value={source} />
            <input type="hidden" name="date" value={selectedDate} />
            <label>Jump to month<input type="month" name="month" defaultValue={selectedMonth} /></label>
            <button className="sv-button sv-secondary sv-small">Go</button>
          </form>
          <div className="booking-weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="booking-calendar-grid marketing-demand-grid">
            {cells.map((cell, index) => cell.date ? <Link key={cell.date} href={`/app/${businessSlug}/marketing/funnel?${queryString({ from: reportFromDate, to: reportToDate, source, month: selectedMonth, date: cell.date })}`} className={`marketing-demand-day${cell.count > 0 ? " has-clicks" : ""}${selectedDate === cell.date ? " selected" : ""}`}><strong>{cell.day}</strong><small>{cell.count}</small></Link> : <span key={`blank-${index}`} className="marketing-demand-day blank" />)}
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
      <div className="marketing-sources-table marketing-rental-items-table"><div><b>Rental item</b><b>Item clicks</b><b>Date picks / availability checks</b><b>Booking starts</b><b>Bookings</b><b>Revenue</b></div>{itemRows.map((item) => <div key={item.id}><span>{item.name}</span><span>{item.clicks}</span><span>{item.datePicks}</span><span>{item.bookingStarts}</span><span>{item.bookings}</span><span>{money(item.revenueCents)}</span></div>)}</div>
      <div className="marketing-rental-item-cards">{itemRows.map((item) => <article className="workspace-panel" key={`mobile-${item.id}`}><h3>{item.name}</h3><p>{item.clicks} clicks</p><p>{item.datePicks} date picks</p><p>{item.bookings} bookings</p><p>{money(item.revenueCents)} revenue</p></article>)}</div>
    </section>
  </section></main>;
}
