"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { attributionFromSearch, type AcquisitionEvent, type AttributionValues } from "@/lib/acquisitionFunnel";

const storageKey = (industry: string) => `servonas.website-acquisition.${industry}`;
const cookieKey = (industry: string) => `servonas_acquisition_${industry}`;
const dedupeKey = (industry: string) => `servonas.website-acquisition-dedupe.${industry}`;
const sessionTouchIntervalMs = 15 * 60 * 1000;
const activeHeartbeatMs = 2_000;
const scrollMilestones = [25, 50, 75, 90];
const eventTtlMs: Partial<Record<AcquisitionEvent, number>> = {
  marketing_landing_view: 60_000,
  page_viewed: 2_000,
  pricing_viewed: 15_000,
  demo_clicked: 5_000,
  demo_started: 30_000,
  primary_cta_clicked: 5_000,
  secondary_cta_clicked: 5_000,
  signup_started: 15_000,
  servonas_signup_started: 15_000,
  website_builder_started: 15_000,
  builder_started: 15_000,
  scroll_depth_reached: 60_000,
};

type Stored = {
  sessionId: string;
  attribution: AttributionValues;
  landingUrl: string;
  referrer: string;
  lastSessionSyncAt?: number;
};

type TrackOptions = {
  metadata?: Record<string, unknown>;
  initialSessionId?: string;
  touchOnly?: boolean;
  beacon?: boolean;
};

const readCookie = (key: string) => document.cookie.split("; ").find((item) => item.startsWith(`${key}=`))?.slice(key.length + 1) ?? "";
const writeCookie = (key: string, value: string) => { document.cookie = `${key}=${value}; Path=/; Max-Age=2592000; SameSite=Lax`; };
const sanitizeLabel = (value: string | null | undefined, max = 120) => value?.replace(/\s+/g, " ").trim().slice(0, max) ?? "";
const cleanPath = () => `${location.pathname}${location.search}`;
const state = (industry: string, initialSessionId?: string): Stored => {
  const raw = localStorage.getItem(storageKey(industry));
  if (raw) {
    try {
      const saved = JSON.parse(raw) as Stored;
      if (saved.sessionId) return saved;
    } catch {}
  }
  const cookieSessionId = readCookie(cookieKey(industry));
  const sessionId = initialSessionId || cookieSessionId || crypto.randomUUID();
  const next = {
    sessionId,
    attribution: attributionFromSearch(new URLSearchParams(location.search)),
    landingUrl: location.href,
    referrer: document.referrer,
    lastSessionSyncAt: 0,
  };
  localStorage.setItem(storageKey(industry), JSON.stringify(next));
  writeCookie(cookieKey(industry), sessionId);
  return next;
};
const updateState = (industry: string, next: Stored) => {
  localStorage.setItem(storageKey(industry), JSON.stringify(next));
  writeCookie(cookieKey(industry), next.sessionId);
};
const eventFingerprint = (event: AcquisitionEvent, metadata: Record<string, unknown>) => JSON.stringify([event, cleanPath(), metadata]);
const shouldSkipEvent = (industry: string, event: AcquisitionEvent, metadata: Record<string, unknown>) => {
  const ttl = eventTtlMs[event];
  if (!ttl) return false;
  try {
    const raw = window.sessionStorage.getItem(dedupeKey(industry));
    const current = raw ? JSON.parse(raw) as Record<string, number> : {};
    const now = Date.now();
    const fingerprint = eventFingerprint(event, metadata);
    const previous = current[fingerprint];
    current[fingerprint] = now;
    for (const [key, value] of Object.entries(current)) if (!Number.isFinite(value) || now - value > Math.max(ttl, sessionTouchIntervalMs)) delete current[key];
    window.sessionStorage.setItem(dedupeKey(industry), JSON.stringify(current));
    return Number.isFinite(previous) && now - previous < ttl;
  } catch {
    return false;
  }
};
const elementLabel = (element: Element | null) => {
  if (!(element instanceof HTMLElement)) return "";
  return sanitizeLabel(
    element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.getAttribute("data-analytics-label") ||
      element.textContent ||
      element.id ||
      element.getAttribute("name"),
  );
};
const eventForClickTarget = (target: Element | null): AcquisitionEvent | null => {
  if (!(target instanceof HTMLElement)) return null;
  if (target.hasAttribute("data-acquisition-pricing")) return "pricing_viewed";
  if (target.hasAttribute("data-acquisition-demo")) return "demo_clicked";
  if (target.hasAttribute("data-acquisition-signup")) return "servonas_signup_started";
  if (target.hasAttribute("data-acquisition-builder")) return "website_builder_started";
  if (target.hasAttribute("data-acquisition-primary-cta")) return "primary_cta_clicked";
  if (target.hasAttribute("data-acquisition-secondary-cta")) return "secondary_cta_clicked";
  return null;
};
export const shouldCountPageAsActive = (visibilityState: string, focused: boolean) => visibilityState === "visible" || focused;

export function acquisitionSessionId(industry: string, initialSessionId?: string) {
  return typeof window === "undefined" ? "" : state(industry, initialSessionId).sessionId;
}

export function trackAcquisition(industry: string, event: AcquisitionEvent, metadata: Record<string, unknown> = {}, initialSessionId?: string, options: Omit<TrackOptions, "metadata" | "initialSessionId"> = {}) {
  if (typeof window === "undefined") return;
  if (shouldSkipEvent(industry, event, metadata)) return;
  const current = state(industry, initialSessionId);
  const now = Date.now();
  const touchSession = event === "marketing_landing_view" || !current.lastSessionSyncAt || now - current.lastSessionSyncAt >= sessionTouchIntervalMs || Boolean(options.touchOnly);
  if (touchSession) updateState(industry, { ...current, lastSessionSyncAt: now });
  const payload = {
    sessionId: current.sessionId,
    industry,
    event,
    path: cleanPath(),
    landingUrl: current.landingUrl,
    referrer: current.referrer,
    attribution: current.attribution,
    metadata,
    touchSession,
    touchOnly: Boolean(options.touchOnly),
  };
  if (options.beacon && typeof navigator.sendBeacon === "function") {
    try {
      if (navigator.sendBeacon("/api/marketing/acquisition", new Blob([JSON.stringify(payload)], { type: "application/json" }))) return;
    } catch {}
  }
  void fetch("/api/marketing/acquisition", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export function AcquisitionFunnelTracker({ industry, event, metadata, initialSessionId }: { industry: string; event: AcquisitionEvent; metadata?: Record<string, unknown>; initialSessionId?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname || "/"}?${searchParams?.toString() || ""}`;
  const sent = useRef(false);
  const pageStartedAt = useRef(Date.now());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = state(industry, initialSessionId);
    if (initialSessionId && current.sessionId !== initialSessionId) updateState(industry, { ...current, sessionId: initialSessionId });
    pageStartedAt.current = Date.now();
    if (!sent.current) {
      sent.current = true;
      trackAcquisition(industry, event, metadata ?? {}, initialSessionId);
    } else {
      trackAcquisition(industry, "page_viewed", { navigation_type: "spa", path: location.pathname, route_key: routeKey }, initialSessionId);
    }
    const path = location.pathname.toLowerCase();
    if (path.startsWith("/demo")) trackAcquisition(industry, "demo_started", { demo_path: location.pathname }, initialSessionId);
  }, [event, industry, initialSessionId, metadata, routeKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onClick = (nativeEvent: MouseEvent) => {
      const target = nativeEvent.target instanceof Element ? nativeEvent.target.closest("a,button,[data-acquisition-primary-cta],[data-acquisition-secondary-cta],[data-acquisition-demo],[data-acquisition-pricing],[data-acquisition-signup],[data-acquisition-builder]") : null;
      const acquisitionEvent = eventForClickTarget(target);
      if (!acquisitionEvent) return;
      const href = target instanceof HTMLAnchorElement ? target.getAttribute("href") || "" : "";
      const label = elementLabel(target);
      const metadata = {
        label,
        href: sanitizeLabel(href, 240) || null,
        path: location.pathname,
        interaction_location: target?.getAttribute("data-acquisition-location") || null,
      };
      trackAcquisition(industry, acquisitionEvent, metadata, initialSessionId);
      if (acquisitionEvent === "website_builder_started") trackAcquisition(industry, "builder_started", metadata, initialSessionId);
      if (acquisitionEvent === "servonas_signup_started") trackAcquisition(industry, "signup_started", metadata, initialSessionId);
    };
    const onScroll = () => {
      const height = document.documentElement.scrollHeight - window.innerHeight;
      if (height <= 0) return;
      const percent = Math.min(100, Math.round((window.scrollY / height) * 100));
      for (const milestone of scrollMilestones) {
        if (percent >= milestone) trackAcquisition(industry, "scroll_depth_reached", { milestone_percent: milestone, path: location.pathname }, initialSessionId);
      }
    };
    const observeSection = (id: string, eventName: AcquisitionEvent, extra: Record<string, unknown> = {}) => {
      const node = document.getElementById(id);
      if (!node) return () => undefined;
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.4)) {
          trackAcquisition(industry, eventName, { section_id: id, path: location.pathname, ...extra }, initialSessionId);
          observer.disconnect();
        }
      }, { threshold: [0.4] });
      observer.observe(node);
      return () => observer.disconnect();
    };
    const stopPricingObserver = observeSection("pricing", "pricing_viewed");
    const stopDemoObserver = observeSection("demo", "demo_started");
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      stopPricingObserver();
      stopDemoObserver();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("scroll", onScroll);
    };
  }, [industry, initialSessionId, routeKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let activeStartedAt: number | null = shouldCountPageAsActive(document.visibilityState, document.hasFocus()) ? Date.now() : null;
    const begin = () => {
      if (shouldCountPageAsActive(document.visibilityState, document.hasFocus()) && activeStartedAt == null) activeStartedAt = Date.now();
    };
    const flush = (reason: "heartbeat" | "visibility_hidden" | "blur" | "pagehide" | "cleanup" | "route_change", isFinal = false) => {
      const now = Date.now();
      const activeMilliseconds = activeStartedAt == null ? 0 : Math.max(0, now - activeStartedAt);
      activeStartedAt = shouldCountPageAsActive(document.visibilityState, document.hasFocus()) && !isFinal ? now : null;
      if (!activeMilliseconds && !isFinal) return;
      trackAcquisition(industry, "session_heartbeat", {
        timing_event_type: isFinal ? "final_flush" : "heartbeat",
        timing_flush_reason: reason,
        timing_is_final: isFinal,
        active_duration_increment_milliseconds: activeMilliseconds,
        timing_available: true,
        last_active_at: new Date(now).toISOString(),
        page_path: location.pathname,
      }, initialSessionId, { touchOnly: true, beacon: isFinal });
    };
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") flush("visibility_hidden", true); else begin(); };
    const onPageHide = () => flush("pagehide", true);
    const onFocus = () => begin();
    const onBlur = () => { if (document.visibilityState === "hidden") flush("blur"); };
    const interval = window.setInterval(() => flush("heartbeat"), activeHeartbeatMs);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      flush(routeKey ? "route_change" : "cleanup", true);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [industry, initialSessionId, routeKey]);

  return null;
}

export function AcquisitionBuilderLinkTracker({ industry }: { industry: string }) {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest("a[data-acquisition-builder]");
      if (target) {
        const href = target.getAttribute("href") || "";
        const metadata = { label: elementLabel(target), href: sanitizeLabel(href, 240) || null, path: location.pathname };
        trackAcquisition(industry, "website_builder_started", metadata);
        trackAcquisition(industry, "builder_started", metadata);
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [industry]);
  return null;
}

export function AcquisitionSignupLinkTracker({ industry }: { industry: string }) {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = (event.target as Element | null)?.closest("a[data-acquisition-signup]");
      if (target) {
        const href = target.getAttribute("href") || "";
        const metadata = { label: elementLabel(target), href: sanitizeLabel(href, 240) || null, path: location.pathname };
        trackAcquisition(industry, "servonas_signup_started", metadata);
        trackAcquisition(industry, "signup_started", metadata);
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [industry]);
  return null;
}
