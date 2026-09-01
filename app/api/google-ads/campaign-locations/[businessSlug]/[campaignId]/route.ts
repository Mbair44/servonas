import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import {
 addGoogleAdsCampaignLocation,
 fetchGoogleAdsCampaignLocationTargeting,
 googleAdsPreferredLoginCustomerIds,
 loadTenantGoogleAdsAccess,
 removeGoogleAdsCampaignLocation,
 writeGoogleAdsAuditLog,
} from "@/lib/googleAdsManagement";
import { requireWorkspace } from "@/lib/workspace";

const logStage = (message: string, payload: Record<string, unknown>) => {
 console.info(message, payload);
};

const durationMs = (startedAt: number) => Date.now() - startedAt;

function resolvedMutationAccess(
 status: string | null | undefined,
 choices: Array<{ id: string; loginCustomerId?: string | null }>,
 selectedCustomerId?: string | null,
) {
 const selected = selectedCustomerId ? choices.find((customer) => customer.id === selectedCustomerId) ?? null : null;
 if (status === "account_access_verified") {
  return {
   resolvedLoginCustomerId: null,
   loginCustomerIds: googleAdsPreferredLoginCustomerIds([]),
  };
 }
 if (selected?.loginCustomerId) {
  return {
   resolvedLoginCustomerId: selected.loginCustomerId,
   loginCustomerIds: googleAdsPreferredLoginCustomerIds([selected.loginCustomerId]),
  };
 }
 return {
  resolvedLoginCustomerId: null,
  loginCustomerIds: googleAdsPreferredLoginCustomerIds([]),
 };
}

async function loadCampaignContext(businessSlug: string, campaignId: string) {
 const { supabase, business, user, role } = await requireWorkspace(businessSlug);
 if (!canManageBusiness(role)) return { error: NextResponse.json({ error: "Only owners and administrators can manage Google Ads." }, { status: 403 }) };
 const connection = await loadTenantGoogleAdsAccess(business.id);
 if (!connection?.customerId) return { error: NextResponse.json({ error: "Reconnect Google Ads before changing locations." }, { status: 409 }) };
 const { data: campaign } = await supabase.from("business_google_ads_campaigns")
  .select("id,google_campaign_id,google_ads_customer_id")
  .eq("business_id", business.id)
  .eq("id", campaignId)
  .maybeSingle();
 if (!campaign?.google_campaign_id || !campaign.google_ads_customer_id) {
  return { error: NextResponse.json({ error: "The published campaign could not be found." }, { status: 404 }) };
 }
 const mutationAccess = resolvedMutationAccess(connection.status, connection.customerChoices, campaign.google_ads_customer_id);
 return { supabase, business, user, connection, campaign, mutationAccess };
}

async function refreshLocations(input: {
 accessToken: string;
 customerId: string;
 campaignId: string;
 loginCustomerId: string | null;
 businessId: string;
}) {
 const refreshed = await fetchGoogleAdsCampaignLocationTargeting({
  accessToken: input.accessToken,
  customerId: input.customerId,
  campaignIds: [input.campaignId],
  loginCustomerId: input.loginCustomerId,
  businessId: input.businessId,
 });
 return refreshed[0] ?? {
  campaignId: input.campaignId,
  targetedLocations: [],
  excludedLocations: [],
  positiveGeoTargetType: null,
  negativeGeoTargetType: null,
 };
}

export async function GET(_request: Request, { params }: { params: Promise<{ businessSlug: string; campaignId: string }> }) {
 const startedAt = Date.now();
 const { businessSlug, campaignId } = await params;
 logStage("google_ads_location_fetch_started", { stage: "google_ads_location_fetch_started", businessSlug, campaignId });
 const loaded = await loadCampaignContext(businessSlug, campaignId);
 if ("error" in loaded) return loaded.error;
 const { business, connection, campaign, mutationAccess } = loaded;
 try {
  const locations = await refreshLocations({
   accessToken: connection.accessToken,
   customerId: campaign.google_ads_customer_id,
   campaignId: campaign.google_campaign_id,
   loginCustomerId: mutationAccess.resolvedLoginCustomerId,
   businessId: business.id,
  });
  logStage("google_ads_location_fetch_completed", { stage: "google_ads_location_fetch_completed", businessId: business.id, businessSlug, campaignId, durationMs: durationMs(startedAt) });
  return NextResponse.json({ success: true, locations });
 } catch (error) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Campaign locations could not be loaded." }, { status: 400 });
 }
}

export async function POST(request: Request, { params }: { params: Promise<{ businessSlug: string; campaignId: string }> }) {
 const startedAt = Date.now();
 const { businessSlug, campaignId } = await params;
 logStage("google_ads_location_add_started", { stage: "google_ads_location_add_started", businessSlug, campaignId });
 const loaded = await loadCampaignContext(businessSlug, campaignId);
 if ("error" in loaded) return loaded.error;
 const { supabase, business, user, connection, campaign, mutationAccess } = loaded;
 const body = await request.json().catch(() => null) as { geoTargetConstant?: string } | null;
 const geoTargetConstant = String(body?.geoTargetConstant ?? "").trim();
 if (!geoTargetConstant) return NextResponse.json({ error: "Choose a valid Google Ads location." }, { status: 400 });
 try {
  const current = await refreshLocations({
   accessToken: connection.accessToken,
   customerId: campaign.google_ads_customer_id,
   campaignId: campaign.google_campaign_id,
   loginCustomerId: mutationAccess.resolvedLoginCustomerId,
   businessId: business.id,
  });
  if (current.targetedLocations.some((location) => location.geoTargetConstant === geoTargetConstant)) {
   return NextResponse.json({ error: "That location is already targeted." }, { status: 409 });
  }
  logStage("google_ads_location_add_mutation_started", { stage: "google_ads_location_add_mutation_started", businessId: business.id, businessSlug, campaignId, geoTargetConstant });
  await addGoogleAdsCampaignLocation({
   accessToken: connection.accessToken,
   customerId: campaign.google_ads_customer_id,
   loginCustomerIds: mutationAccess.loginCustomerIds,
   campaignId: campaign.google_campaign_id,
   geoTargetConstant,
  });
  logStage("google_ads_location_add_mutation_completed", { stage: "google_ads_location_add_mutation_completed", businessId: business.id, businessSlug, campaignId, durationMs: durationMs(startedAt) });
  logStage("google_ads_location_add_refetch_started", { stage: "google_ads_location_add_refetch_started", businessId: business.id, businessSlug, campaignId });
  const latest = await refreshLocations({
   accessToken: connection.accessToken,
   customerId: campaign.google_ads_customer_id,
   campaignId: campaign.google_campaign_id,
   loginCustomerId: mutationAccess.resolvedLoginCustomerId,
   businessId: business.id,
  });
  logStage("google_ads_location_add_refetch_completed", { stage: "google_ads_location_add_refetch_completed", businessId: business.id, businessSlug, campaignId, durationMs: durationMs(startedAt) });
  await supabase.from("business_google_ads_campaigns").update({
   geo_target_summary: latest.targetedLocations.length
    ? latest.targetedLocations.slice(0, 3).map((location) => location.canonicalName || location.name).join(", ")
    : "No locations currently configured",
   last_sync_at: new Date().toISOString(),
   updated_by: user.id,
   updated_at: new Date().toISOString(),
  }).eq("business_id", business.id).eq("id", campaignId);
  await writeGoogleAdsAuditLog({
   businessId: business.id,
   campaignId,
   actorUserId: user.id,
   eventType: "google_ads_campaign_location_added",
   metadata: { geoTargetConstant },
  });
  logStage("google_ads_location_add_completed", { stage: "google_ads_location_add_completed", businessId: business.id, businessSlug, campaignId, durationMs: durationMs(startedAt) });
  return NextResponse.json({ success: true, message: "Location added.", locations: latest });
 } catch (error) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Campaign location could not be added." }, { status: 400 });
 }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ businessSlug: string; campaignId: string }> }) {
 const startedAt = Date.now();
 const { businessSlug, campaignId } = await params;
 logStage("google_ads_location_remove_started", { stage: "google_ads_location_remove_started", businessSlug, campaignId });
 const loaded = await loadCampaignContext(businessSlug, campaignId);
 if ("error" in loaded) return loaded.error;
 const { supabase, business, user, connection, campaign, mutationAccess } = loaded;
 const body = await request.json().catch(() => null) as { criterionResourceName?: string } | null;
 const criterionResourceName = String(body?.criterionResourceName ?? "").trim();
 if (!criterionResourceName) return NextResponse.json({ error: "That Google Ads location could not be removed." }, { status: 400 });
 try {
  logStage("google_ads_location_remove_mutation_started", { stage: "google_ads_location_remove_mutation_started", businessId: business.id, businessSlug, campaignId });
  await removeGoogleAdsCampaignLocation({
   accessToken: connection.accessToken,
   customerId: campaign.google_ads_customer_id,
   loginCustomerIds: mutationAccess.loginCustomerIds,
   criterionResourceName,
  });
  logStage("google_ads_location_remove_mutation_completed", { stage: "google_ads_location_remove_mutation_completed", businessId: business.id, businessSlug, campaignId, durationMs: durationMs(startedAt) });
  logStage("google_ads_location_remove_refetch_started", { stage: "google_ads_location_remove_refetch_started", businessId: business.id, businessSlug, campaignId });
  const latest = await refreshLocations({
   accessToken: connection.accessToken,
   customerId: campaign.google_ads_customer_id,
   campaignId: campaign.google_campaign_id,
   loginCustomerId: mutationAccess.resolvedLoginCustomerId,
   businessId: business.id,
  });
  logStage("google_ads_location_remove_refetch_completed", { stage: "google_ads_location_remove_refetch_completed", businessId: business.id, businessSlug, campaignId, durationMs: durationMs(startedAt) });
  await supabase.from("business_google_ads_campaigns").update({
   geo_target_summary: latest.targetedLocations.length
    ? latest.targetedLocations.slice(0, 3).map((location) => location.canonicalName || location.name).join(", ")
    : "No locations currently configured",
   last_sync_at: new Date().toISOString(),
   updated_by: user.id,
   updated_at: new Date().toISOString(),
  }).eq("business_id", business.id).eq("id", campaignId);
  await writeGoogleAdsAuditLog({
   businessId: business.id,
   campaignId,
   actorUserId: user.id,
   eventType: "google_ads_campaign_location_removed",
   metadata: { criterionResourceName },
  });
  logStage("google_ads_location_remove_completed", { stage: "google_ads_location_remove_completed", businessId: business.id, businessSlug, campaignId, durationMs: durationMs(startedAt) });
  return NextResponse.json({ success: true, message: "Location removed.", locations: latest });
 } catch (error) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "Campaign location could not be removed." }, { status: 400 });
 }
}
