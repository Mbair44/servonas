import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { loadTenantGoogleAdsAccess, searchGoogleAdsGeoTargets } from "@/lib/googleAdsManagement";
import { requireWorkspace } from "@/lib/workspace";

const logStage = (message: string, payload: Record<string, unknown>) => {
 console.info(message, payload);
};

export async function GET(request: Request, { params }: { params: Promise<{ businessSlug: string; campaignId: string }> }) {
 const startedAt = Date.now();
 const { businessSlug, campaignId } = await params;
 const { business, role } = await requireWorkspace(businessSlug);
 if (!canManageBusiness(role)) return NextResponse.json({ error: "Only owners and administrators can manage Google Ads." }, { status: 403 });
 const connection = await loadTenantGoogleAdsAccess(business.id);
 if (!connection?.customerId) return NextResponse.json({ error: "Connect Google Ads first." }, { status: 409 });
 const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
 if (!query) return NextResponse.json({ success: true, results: [] });
 logStage("google_ads_location_search_started", { stage: "google_ads_location_search_started", businessId: business.id, businessSlug, campaignId, query });
 try {
  const results = await searchGoogleAdsGeoTargets({
   accessToken: connection.accessToken,
   customerId: connection.customerId,
   loginCustomerId: connection.loginCustomerId,
   query,
   businessId: business.id,
  });
  logStage("google_ads_location_search_completed", { stage: "google_ads_location_search_completed", businessId: business.id, businessSlug, campaignId, durationMs: Date.now() - startedAt, resultCount: results.length });
  return NextResponse.json({ success: true, results });
 } catch (error) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Google Ads locations could not be searched." }, { status: 400 });
 }
}
