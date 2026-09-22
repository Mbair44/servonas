"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { attributionFromSearch, type AttributionValues, type BookingFunnelEvent } from "@/lib/bookingFunnel";
import { publicBookingFunnelEnabled } from "@/lib/optionalAnalytics";

const key = (slug: string) => `servonas.booking-attribution.${slug}`;
const dedupeKey = (slug: string) => `servonas.booking-funnel-dedupe.${slug}`;
const debugKey = "servonas.booking-funnel-debug";
const analyticsConsentKey = "servonas.analytics_consent";
const analyticsEnabled = publicBookingFunnelEnabled();
const sessionTouchIntervalMs = 15 * 60 * 1000;
const activeHeartbeatMs = 2_000;
const interactionEvents = new Set<BookingFunnelEvent>(["inventory_item_clicked", "event_date_selected", "event_date_changed", "booking_date_selected", "availability_date_selected", "date_selected"]);
const eventTtlMs: Partial<Record<BookingFunnelEvent, number>> = { landing_page_view: 60_000, landing_view: 60_000, service_view: 60_000, inventory_item_view: 60_000, inventory_view: 60_000, inventory_item_clicked: 60_000, booking_cta_click: 15_000, availability_check_started: 15_000, availability_check: 15_000, check_availability_clicked: 15_000, event_date_selected: 5_000, event_date_changed: 5_000, date_selected: 5_000, rental_availability_checked: 5_000, rental_available: 5_000, rental_unavailable: 5_000, available_inventory_viewed: 5_000, booking_started: 15_000, customer_info_entered: 10_000, customer_info_completed: 60_000, delivery_address_completed: 60_000, terms_accepted: 60_000, payment_cta_clicked: 15_000, payment_started: 60_000, lead_submitted: 10_000, checkout_started: 15_000, checkout_addons_viewed: 60_000, checkout_addons_skipped: 60_000, checkout_addons_added: 60_000, reservation_details_viewed: 60_000, reserve_clicked: 5_000, item_added_to_cart: 5_000, link_click: 5_000, button_click: 5_000, phone_click: 5_000, sms_click: 5_000, email_click: 5_000, form_start: 30_000, form_submit: 15_000, product_service_selection: 10_000 };
const criticalEvents = new Set<BookingFunnelEvent>(["booking_started", "customer_info_entered", "checkout_started", "reserve_clicked", "item_added_to_cart", "lead_submitted", "payment_completed"]);
type Stored = { sessionId: string; attribution: AttributionValues; landingUrl: string; referrer: string; lastSessionSyncAt?: number };
type TrackBookingFunnelOptions = { inventoryItemId?: string; serviceId?: string; metadata?: Record<string, unknown>; touchOnly?: boolean; beacon?: boolean };
const formStartKey = (slug: string) => `servonas.booking-funnel-form-start.${slug}`;
const inMemorySessions = new Map<string, Stored>();
const readSession = (slug: string) => { try { return window.sessionStorage.getItem(key(slug)); } catch { return inMemorySessions.get(slug) ? JSON.stringify(inMemorySessions.get(slug)) : null; } };
const writeSession = (slug: string, value: Stored) => { inMemorySessions.set(slug,value); try { window.sessionStorage.setItem(key(slug),JSON.stringify(value)); } catch { /* memory keeps this page's attribution when storage is blocked */ } };

const stored = (slug: string): Stored => {
 const existing = readSession(slug); if (existing) { try { const value = JSON.parse(existing) as Stored; if (value.sessionId) return value; } catch { /* replace malformed storage */ } }
 let referrerSearch: URLSearchParams | undefined; try { referrerSearch = document.referrer ? new URL(document.referrer).searchParams : undefined; } catch { /* malformed referrer */ }
 const value = { sessionId: crypto.randomUUID(), attribution: attributionFromSearch(new URLSearchParams(location.search), referrerSearch), landingUrl: location.href, referrer: document.referrer, lastSessionSyncAt: 0 }; writeSession(slug,value); return value;
};
const bookingPathFor = (slug: string) => `/book/${encodeURIComponent(slug)}`;
const bookingCheckoutPathFor = (slug: string) => `${bookingPathFor(slug)}/booking`;
const isBookingUrl = (url: URL, slug: string) => { const pathname = url.pathname.replace(/\/$/, "") || "/"; return pathname === bookingPathFor(slug) || pathname === bookingCheckoutPathFor(slug) || pathname === "/booking" || pathname === "/booking/checkout"; };
const applyStoredAttribution = (url: URL, slug: string) => { const state = stored(slug); if (!url.searchParams.has("sv_at")) url.searchParams.set("sv_at", state.sessionId); for (const [name, value] of Object.entries(state.attribution)) if (value && !url.searchParams.has(name)) url.searchParams.set(name, value); return url; };
const eventFingerprint = (event: BookingFunnelEvent, options: TrackBookingFunnelOptions) => JSON.stringify([event, typeof window === "undefined" ? "" : `${location.pathname}${location.search}`, options.inventoryItemId ?? null, options.serviceId ?? null, options.metadata ?? {}]);
const shouldSkipEvent = (slug: string, event: BookingFunnelEvent, options: TrackBookingFunnelOptions) => {
 if (interactionEvents.has(event)) return false;
 const ttl = eventTtlMs[event]; if (!ttl || typeof window === "undefined") return false; const fingerprint = eventFingerprint(event, options);
 try { const raw = window.sessionStorage.getItem(dedupeKey(slug)); const current = raw ? JSON.parse(raw) as Record<string, number> : {}; const now = Date.now(); const previous = current[fingerprint]; current[fingerprint] = now; for (const [name, value] of Object.entries(current)) if (!Number.isFinite(value) || now - value > Math.max(ttl, sessionTouchIntervalMs)) delete current[name]; window.sessionStorage.setItem(dedupeKey(slug), JSON.stringify(current)); return Number.isFinite(previous) && now - previous < ttl; } catch { return false; }
};
const debugEnabled = () => { if (typeof window === "undefined") return false; try { return new URLSearchParams(window.location.search).get("sv_debug_funnel") === "1" || window.localStorage.getItem(debugKey) === "1"; } catch { return false; } };
const logDebug = (slug: string, event: BookingFunnelEvent, message: string, details: Record<string, unknown> = {}) => { if (debugEnabled()) console.info("[Servonas booking funnel]", { slug, event, message, ...details }); };
const safeReferrerHostname = () => { try { return document.referrer ? new URL(document.referrer).hostname : null; } catch { return null; } };
const clientDiagnosticContext = (state: Stored) => ({
 pathname: location.pathname,
 sessionPresent: Boolean(state.sessionId),
 attributionPresent: Object.values(state.attribution).some(Boolean),
 utm: { source: state.attribution.utm_source ?? null, medium: state.attribution.utm_medium ?? null, campaign: state.attribution.utm_campaign ?? null, content: state.attribution.utm_content ?? null, term: state.attribution.utm_term ?? null },
 referrerHostname: safeReferrerHostname(),
 analyticsConsent: localStorage.getItem(analyticsConsentKey) ?? "unset",
 firstPartyFunnelIndependentOfConsent: true,
});
const deviceMetadata = (): Record<string, unknown> => { if (typeof window === "undefined") return {}; const ua = window.navigator.userAgent || ""; return { browser: /Chrome\//.test(ua) ? "chrome" : /Safari\//.test(ua) && !/Chrome\//.test(ua) ? "safari" : /Firefox\//.test(ua) ? "firefox" : /Edg\//.test(ua) ? "edge" : "other", operating_system: /iPhone|iPad|iPod/.test(ua) ? "ios" : /Android/.test(ua) ? "android" : /Mac OS X/.test(ua) ? "macos" : /Windows/.test(ua) ? "windows" : /Linux/.test(ua) ? "linux" : "other", device_type: /Mobile|Android|iPhone|iPad|iPod/.test(ua) ? "mobile" : "desktop" }; };
const sanitizeLabel = (value: string | null | undefined, max = 80) => value?.replace(/\s+/g, " ").trim().slice(0, max) ?? "";
const elementLabel = (element: Element | null) => {
 if (!(element instanceof HTMLElement)) return "";
 if (element instanceof HTMLInputElement && /password|email|tel|search|url|number|text/i.test(element.type)) return sanitizeLabel(element.name || element.id || element.placeholder);
 return sanitizeLabel(element.getAttribute("aria-label") || element.getAttribute("title") || element.getAttribute("data-analytics-label") || element.textContent || element.id || element.getAttribute("name"));
};
const elementIdentifier = (element: Element | null) => {
 if (!(element instanceof HTMLElement)) return "";
 const dataId = sanitizeLabel(element.getAttribute("data-analytics-id") || element.id || element.getAttribute("name"), 60);
 if (dataId) return dataId;
 if (element instanceof HTMLAnchorElement) return sanitizeLabel(element.pathname || element.href, 60);
 return sanitizeLabel(element.tagName.toLowerCase(), 60);
};
const meaningfulMetadata = (startedAt: number, event: BookingFunnelEvent, element: Element | null, extra: Record<string, unknown> = {}) => ({
 interaction_type: event,
 interaction_label: elementLabel(element) || sanitizeLabel(typeof extra.interaction_label === "string" ? extra.interaction_label : null),
 interaction_identifier: elementIdentifier(element) || sanitizeLabel(typeof extra.interaction_identifier === "string" ? extra.interaction_identifier : null, 60),
 interaction_pathname: location.pathname || "/",
 interaction_since_session_start_milliseconds: Math.max(0, Date.now() - startedAt),
 ...extra,
});
const pageTypeForPath = (pathname: string) => pathname === "/booking/checkout" || /^\/book\/[^/]+\/booking$/.test(pathname) ? "checkout" : pathname === "/booking" || /^\/book\/[^/]+$/.test(pathname) ? "booking" : "website";
const isEmbeddedBooking = () => new URLSearchParams(location.search).get("embed") === "1";
const payloadFor = (slug: string, event: BookingFunnelEvent, options: TrackBookingFunnelOptions, touchSession: boolean) => { const state = stored(slug), metadata: Record<string, unknown> = { ...deviceMetadata(), ...(options.metadata ?? {}), ...(debugEnabled()?{analytics_consent:localStorage.getItem(analyticsConsentKey)??"unset"}:{}) }; return { sessionId: state.sessionId, event, interactionId: interactionEvents.has(event) ? crypto.randomUUID() : undefined, path: `${location.pathname}${location.search}`, pageType: pageTypeForPath(location.pathname), landingUrl: state.landingUrl, referrer: state.referrer, attribution: state.attribution, inventoryItemId: options.inventoryItemId, serviceId: options.serviceId, metadata, touchSession, touchOnly: Boolean(options.touchOnly) }; };
const postWithBeacon = (slug: string, event: BookingFunnelEvent, payload: ReturnType<typeof payloadFor>) => { if (typeof navigator.sendBeacon !== "function") return false; try { const sent = navigator.sendBeacon(`/api/public-booking/${encodeURIComponent(slug)}/funnel`, new Blob([JSON.stringify(payload)], { type: "application/json" })); logDebug(slug, event, sent ? "beacon_sent" : "beacon_rejected", { eventType: payload.metadata.timing_event_type ?? event, flushReason: payload.metadata.timing_flush_reason ?? null, sendMethod: "beacon" }); return sent; } catch { return false; } };
export const shouldCountPageAsActive = (visibilityState: string, focused: boolean) => visibilityState === "visible" || focused;

export function bookingAttributionSession(slug: string) { return typeof window === "undefined" ? "" : stored(slug).sessionId; }
export function bookingAttributionValues(slug: string): AttributionValues { return typeof window === "undefined" ? {} : { ...stored(slug).attribution }; }
export function trackBookingFunnel(slug: string, event: BookingFunnelEvent, options: TrackBookingFunnelOptions = {}) {
 if (typeof window === "undefined") return;
 if (!analyticsEnabled) { logDebug(slug, event, "dispatch_skipped", { reason: "funnel_disabled" }); return; }
 if (shouldSkipEvent(slug, event, options)) { logDebug(slug, event, "dispatch_skipped", { reason: "client_deduped" }); return; }
 const state = stored(slug), now = Date.now(), touchSession = event === "landing_page_view" || !state.lastSessionSyncAt || now - state.lastSessionSyncAt >= sessionTouchIntervalMs || Boolean(options.touchOnly);
 if (touchSession) writeSession(slug,{ ...state, lastSessionSyncAt: now });
 const payload = payloadFor(slug, event, options, touchSession);
 logDebug(slug, event, "dispatch_attempted", { ...clientDiagnosticContext(state), touchSession, sendMethod: criticalEvents.has(event) || options.beacon ? "beacon_or_fetch" : "fetch" });
 if ((criticalEvents.has(event) || options.beacon) && postWithBeacon(slug, event, payload)) return;
 void fetch(`/api/public-booking/${encodeURIComponent(slug)}/funnel`, { method: "POST", headers: { "content-type": "application/json" }, keepalive: true, cache: "no-store", credentials: "same-origin", body: JSON.stringify(payload) }).then((response) => logDebug(slug, event, "fetch_complete", { ...clientDiagnosticContext(state), status: response.status, result: response.headers.get("x-servonas-funnel-result"), eventType: payload.metadata.timing_event_type ?? event, flushReason: payload.metadata.timing_flush_reason ?? null, sendMethod: "fetch", persistSucceeded: response.ok })).catch(() => logDebug(slug, event, "fetch_failed", { ...clientDiagnosticContext(state), eventType: payload.metadata.timing_event_type ?? event, flushReason: payload.metadata.timing_flush_reason ?? null, sendMethod: "fetch", persistSucceeded: false, reason: "network_or_lifecycle" }));
}

type TenantBookingFunnelTrackerProps = {
 businessSlug: string;
 initialSessionId?: string;
 landingType?: "website" | "promotion" | "location" | "category" | "inventory_item";
 landingId?: string;
 landingLabel?: string;
 inventoryItemId?: string;
};

export function TenantBookingFunnelTracker({ businessSlug, initialSessionId, landingType = "website", landingId, landingLabel, inventoryItemId }: TenantBookingFunnelTrackerProps) {
 const pathname = usePathname();
 const searchParams = useSearchParams();
 const routeKey = `${pathname || "/"}?${searchParams?.toString() || ""}`;
 const sent = useRef(false);
 const sessionStartedAt = useRef<number>(Date.now());
 useEffect(() => {
  if (!analyticsEnabled) return;
  if (initialSessionId && /^[0-9a-f-]{36}$/i.test(initialSessionId)) {
   const current = stored(businessSlug);
   writeSession(businessSlug,{ ...current, sessionId: initialSessionId });
  }
  const current = stored(businessSlug);
  if (!sent.current) {
   sent.current = true;
   sessionStartedAt.current = Date.now();
   trackBookingFunnel(businessSlug, landingType==="promotion"?"promotion_landing_view":"landing_page_view", { inventoryItemId, beacon: landingType === "promotion", metadata: { landing_type: landingType, landing_id: landingId ?? null, landing_label: landingLabel ?? null } });
  } else {
   trackBookingFunnel(businessSlug, "landing_view", { metadata: { navigation_type: "spa" } });
  }
  if (pageTypeForPath(location.pathname) === "booking" && !isEmbeddedBooking()) trackBookingFunnel(businessSlug, "booking_started", { metadata: meaningfulMetadata(sessionStartedAt.current, "booking_started", null, { surface: "booking_page", entry: "route_load" }) });
  const rewrite = (root: ParentNode = document) => root.querySelectorAll<HTMLAnchorElement | HTMLIFrameElement>("a[href],iframe[src]").forEach((element) => { const attribute = element instanceof HTMLAnchorElement ? "href" : "src", raw = element.getAttribute(attribute); if (!raw) return; try { const url = new URL(raw, location.href); if (isBookingUrl(url, businessSlug)) element.setAttribute(attribute, applyStoredAttribution(url, businessSlug).toString()); } catch { /* leave external URL usable */ } });
  rewrite();
  const observer = new MutationObserver(() => rewrite());
  observer.observe(document.body, { childList: true, subtree: true });
  const seenForms = new Set<string>();
  try { window.sessionStorage.removeItem(formStartKey(businessSlug)); } catch { /* ignore storage failures */ }
  const onClick = (event: MouseEvent) => {
   const target = event.target instanceof Element ? event.target.closest("a,button,[data-booking-cta],[data-track-booking-funnel]") : null;
   if (!target || target.closest("[data-funnel-click-owned]")) return;
   if (target instanceof HTMLAnchorElement) {
    const href = target.getAttribute("href") || "";
    const metadata = meaningfulMetadata(sessionStartedAt.current, href.startsWith("tel:") ? "phone_click" : href.startsWith("sms:") ? "sms_click" : href.startsWith("mailto:") ? "email_click" : isBookingUrl(new URL(target.href, location.href), businessSlug) ? "booking_cta_click" : "link_click", target, { href: sanitizeLabel(href, 200) });
    if (href.startsWith("tel:")) trackBookingFunnel(businessSlug, "phone_click", { metadata });
    else if (href.startsWith("sms:")) trackBookingFunnel(businessSlug, "sms_click", { metadata });
    else if (href.startsWith("mailto:")) trackBookingFunnel(businessSlug, "email_click", { metadata });
    else if (isBookingUrl(new URL(target.href, location.href), businessSlug)){const promotionEvent=target.dataset.promotionEvent;trackBookingFunnel(businessSlug,promotionEvent==="promotion_primary_cta_clicked"?"promotion_primary_cta_clicked":promotionEvent==="promotion_item_selected"?"promotion_item_selected":"booking_cta_click",{inventoryItemId:target.dataset.inventoryItemId||undefined,metadata:{...metadata,promotion_id:landingId??null}});}
    else trackBookingFunnel(businessSlug, "link_click", { metadata });
    return;
   }
   const label = elementLabel(target);
   const buttonEvent = /book|schedule|availability|reserve|quote|call|text|sms/i.test(label) || target.hasAttribute("data-booking-cta") ? "booking_cta_click" : "button_click";
   trackBookingFunnel(businessSlug, buttonEvent, { metadata: meaningfulMetadata(sessionStartedAt.current, buttonEvent, target) });
  };
  const onFocusIn = (event: FocusEvent) => {
   const target = event.target instanceof Element ? event.target : null;
   const form = target?.closest("form");
   if (!form) return;
   const formId = elementIdentifier(form);
   if (!formId || seenForms.has(formId)) return;
   seenForms.add(formId);
   trackBookingFunnel(businessSlug, "form_start", { metadata: meaningfulMetadata(sessionStartedAt.current, "form_start", target, { form_identifier: formId }) });
  };
  const onChange = (event: Event) => {
   const target = event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement ? event.target : null;
   if (!target) return;
   const descriptor = `${target.name || target.id || ""}:${String(target.value || "").slice(0, 60)}`;
   if (/service|inventory|item|product/i.test(target.name || target.id || "")) trackBookingFunnel(businessSlug, "product_service_selection", { metadata: meaningfulMetadata(sessionStartedAt.current, "product_service_selection", target, { selection_value: sanitizeLabel(descriptor, 80) }) });
  };
  const onSubmit = (event: SubmitEvent) => {
   const form = event.target instanceof HTMLFormElement ? event.target : null;
   if (!form) return;
   trackBookingFunnel(businessSlug, "form_submit", { metadata: meaningfulMetadata(sessionStartedAt.current, "form_submit", form, { form_identifier: elementIdentifier(form) }) });
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("change", onChange, true);
  document.addEventListener("submit", onSubmit, true);
  writeSession(businessSlug,{ ...current, lastSessionSyncAt: Date.now() });
  return () => {
   observer.disconnect();
   document.removeEventListener("click", onClick, true);
   document.removeEventListener("focusin", onFocusIn, true);
   document.removeEventListener("change", onChange, true);
   document.removeEventListener("submit", onSubmit, true);
  };
 }, [businessSlug, initialSessionId, inventoryItemId, landingId, landingLabel, landingType, routeKey, pathname, searchParams]);
 useEffect(() => {
  if (!analyticsEnabled || typeof window === "undefined") return;
  let activeStartedAt: number | null = shouldCountPageAsActive(document.visibilityState, document.hasFocus()) ? Date.now() : null;
  const begin = () => { if (shouldCountPageAsActive(document.visibilityState, document.hasFocus()) && activeStartedAt == null) activeStartedAt = Date.now(); };
  const flush = (reason: "heartbeat" | "visibility_hidden" | "blur" | "pagehide" | "cleanup" | "route_change", isFinal = false) => {
   const now = Date.now(), activeMilliseconds = activeStartedAt == null ? 0 : Math.max(0, now - activeStartedAt); activeStartedAt = shouldCountPageAsActive(document.visibilityState, document.hasFocus()) && !isFinal ? now : null;
   if (!activeMilliseconds && !isFinal) return;
   trackBookingFunnel(businessSlug, "session_heartbeat", { touchOnly: true, beacon: isFinal, metadata: { timing_event_type: isFinal ? "final_flush" : "heartbeat", timing_flush_reason: reason, timing_is_final: isFinal, active_duration_increment_milliseconds: activeMilliseconds, session_duration_increment_seconds: activeMilliseconds / 1000, engaged_duration_increment_seconds: activeMilliseconds / 1000, visibility_state: document.visibilityState } });
   logDebug(businessSlug, "session_heartbeat", "timing_flush", { sessionId: bookingAttributionSession(businessSlug), page: location.pathname, startedAt: activeStartedAt, lastActiveAt: now, activeMilliseconds, eventType: isFinal ? "final_flush" : "heartbeat", flushReason: reason, visibilityState: document.visibilityState, isFinal, sendMethod: isFinal ? "beacon" : "fetch" });
  };
  const onVisibilityChange = () => { if (document.visibilityState === "hidden") flush("visibility_hidden", true); else begin(); };
  const onPageHide = () => flush("pagehide", true);
  const onFocus = () => begin();
  const onBlur = () => { if (document.visibilityState === "hidden") flush("blur"); };
  const interval = window.setInterval(() => flush("heartbeat"), activeHeartbeatMs);
  document.addEventListener("visibilitychange", onVisibilityChange); window.addEventListener("pagehide", onPageHide); window.addEventListener("focus", onFocus); window.addEventListener("blur", onBlur);
  return () => { flush(routeKey ? "route_change" : "cleanup", true); window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibilityChange); window.removeEventListener("pagehide", onPageHide); window.removeEventListener("focus", onFocus); window.removeEventListener("blur", onBlur); };
 }, [businessSlug, routeKey]);
 return null;
}
