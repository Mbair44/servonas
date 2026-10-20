import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { syncGoogleAdsSpend } from "@/lib/googleAdsSpendSync";
import { syncMetaAdsPerformance } from "@/lib/metaAdsManagement";
import { requireWorkspace } from "@/lib/workspace";

const approvedWindows = {
  "oct-1-12": { dateFrom: "2026-10-01", dateThrough: "2026-10-12", providers: ["google_ads", "meta"] as const },
  "oct-13-20-google": { dateFrom: "2026-10-13", dateThrough: "2026-10-20", providers: ["google_ads"] as const },
} as const;

export const dynamic = "force-dynamic";

// This is deliberately a fixed, tenant-admin-only recovery endpoint. It does
// not accept caller-controlled date ranges or providers and may be safely
// retried because the underlying writes are upserts.
async function runBackfill(params: Promise<{ businessSlug: string; window: string }>) {
  const { businessSlug, window } = await params;
  if (businessSlug !== "copper-state-bounce") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const range = approvedWindows[window as keyof typeof approvedWindows];
  if (!range) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { business, role, user } = await requireWorkspace(businessSlug);
  if (!canManageBusiness(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const results = await Promise.allSettled(range.providers.map((provider) => provider === "google_ads"
    ? syncGoogleAdsSpend({ businessId: business.id, dateFrom: range.dateFrom, dateThrough: range.dateThrough })
    : syncMetaAdsPerformance({ businessId: business.id, businessSlug: business.slug, actorUserId: user.id, dateFrom: range.dateFrom, dateThrough: range.dateThrough })));
  const response = results.map((result, index) => result.status === "fulfilled"
    ? { provider: range.providers[index], ok: true, result: result.value }
    : { provider: range.providers[index], ok: false, error: result.reason instanceof Error ? result.reason.message : "Sync failed." });
  const ok = response.every((result) => result.ok);
  return NextResponse.json({ ok, dateFrom: range.dateFrom, dateThrough: range.dateThrough, response }, { status: ok ? 200 : 502, headers: { "cache-control": "no-store" } });
}

export async function POST(_: Request, { params }: { params: Promise<{ businessSlug: string; window: string }> }) {
  return runBackfill(params);
}

// Kept only for the approved recovery windows so an authenticated tenant admin
// can invoke a one-time repair from the browser without handling a cron secret.
export async function GET(_: Request, { params }: { params: Promise<{ businessSlug: string; window: string }> }) {
  return runBackfill(params);
}
