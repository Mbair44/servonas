import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { isServonasPlatformAdmin, platformAdminRole } from "@/lib/platformAccess";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { completeGoogleAdsOauth, discoverGoogleAdsAccounts, persistGoogleAdsOauthConnection, recordGoogleAdsBetaEvent, writeGoogleAdsAuditLog } from "@/lib/googleAdsManagement";

const destination = (slug: string, kind: "success" | "error", message: string) =>
 new URL(`/app/${encodeURIComponent(slug)}/marketing/google-ads?${kind}=${encodeURIComponent(message)}`, process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com");

export async function GET(request: Request) {
 const url = new URL(request.url);
 const code = url.searchParams.get("code");
 const state = url.searchParams.get("state");
 const store = await cookies();
 const raw = store.get("servonas_google_ads_oauth")?.value;
 store.delete("servonas_google_ads_oauth");
 let saved: { state: string; businessSlug: string; businessId: string; actorUserId?: string | null } | null = null;
 try { saved = raw ? JSON.parse(raw) : null; } catch {}
 if (!saved || !state || state !== saved.state || !code) return NextResponse.redirect(destination(saved?.businessSlug || "", "error", "Google Ads authorization could not be verified."));
 const supabase = await createSupabaseServerClient();
 const { data: { user } } = await supabase.auth.getUser();
 console.info("Google Ads callback workspace authorization started", {
  stage: "workspace_authorization",
  businessId: saved.businessId,
  businessSlug: saved.businessSlug,
  hasSessionUser: Boolean(user),
  hasSavedActorUserId: Boolean(saved.actorUserId),
 });
 if (!user) return NextResponse.redirect(destination(saved.businessSlug, "error", "Sign in to Servonas again, then reconnect Google Ads."));
 if (saved.actorUserId && saved.actorUserId !== user.id) {
  console.warn("Google Ads callback workspace authorization rejected", {
   stage: "workspace_authorization",
   businessId: saved.businessId,
   businessSlug: saved.businessSlug,
   reason: "initiator_mismatch",
   sessionUserId: user.id,
  });
  return NextResponse.redirect(destination(saved.businessSlug, "error", "Google Ads reconnect must be completed by the Servonas user who started it. Please reconnect again."));
 }
 const isPlatformAdmin = isServonasPlatformAdmin(user);
 const { data: business } = await supabase.from("businesses").select("owner_user_id").eq("id", saved.businessId).maybeSingle();
 const { data: membership } = await supabase.from("business_members").select("role").eq("business_id", saved.businessId).eq("user_id", user.id).maybeSingle();
 const resolvedRole = isPlatformAdmin
  ? platformAdminRole
  : business?.owner_user_id === user.id
   ? "owner"
   : typeof membership?.role === "string"
    ? membership.role
    : null;
 if (!canManageBusiness(resolvedRole)) {
  console.warn("Google Ads callback workspace authorization rejected", {
   stage: "workspace_authorization",
   businessId: saved.businessId,
   businessSlug: saved.businessSlug,
   reason: "insufficient_workspace_role",
   resolvedRole,
   isPlatformAdmin,
   isOwner: business?.owner_user_id === user.id,
  });
  return NextResponse.redirect(destination(saved.businessSlug, "error", "Google Ads authorization is not permitted for this workspace."));
 }
 console.info("Google Ads callback workspace authorization completed", {
  stage: "workspace_authorization",
  businessId: saved.businessId,
  businessSlug: saved.businessSlug,
  resolvedRole,
  isPlatformAdmin,
  isOwner: business?.owner_user_id === user.id,
 });
 try {
  const result = await completeGoogleAdsOauth(code, { businessId: saved.businessId, businessSlug: saved.businessSlug });
  await persistGoogleAdsOauthConnection({
   businessId: saved.businessId,
   userId: user.id,
   refreshToken: result.refreshToken,
   authenticatedIdentity: result.authenticatedIdentity,
   status: "pending_selection",
  });
  const discovery = await discoverGoogleAdsAccounts({
   businessId: saved.businessId,
   userId: user.id,
   accessToken: result.accessToken,
   authenticatedEmail: result.authenticatedIdentity.email,
   authenticatedName: result.authenticatedIdentity.name,
   maxAttempts: 1,
  });
  await writeGoogleAdsAuditLog({
   businessId: saved.businessId,
   actorUserId: user.id,
   eventType: "google_ads_connected",
   metadata: { discovery_completed: discovery.ok, customerCount: discovery.customers.length, authenticatedEmail: result.authenticatedIdentity.email, authenticatedName: result.authenticatedIdentity.name },
  });
  await recordGoogleAdsBetaEvent({
   businessId: saved.businessId,
   actorUserId: user.id,
   eventName: discovery.ok ? "google_ads_connected" : "google_ads_connected_discovery_pending",
   metadata: { business_slug: saved.businessSlug, customer_count: discovery.customers.length, authenticated_email: result.authenticatedIdentity.email, authenticated_name: result.authenticatedIdentity.name, timestamp: new Date().toISOString() },
  });
  if (discovery.ok && !discovery.customers.length) {
   await recordGoogleAdsBetaEvent({
    businessId: saved.businessId,
    actorUserId: user.id,
    eventName: "google_ads_account_missing",
    metadata: { business_slug: saved.businessSlug, timestamp: new Date().toISOString() },
    });
  }
  const message = !discovery.ok
   ? "Google Ads connected, but Google temporarily limited account lookup. Try refreshing accounts in a few minutes."
   : discovery.customers.length === 1
    ? `Google Ads connected. Account ${discovery.customers[0].label} is ready.`
    : "Google Ads connected. Select which Google Ads account this business should use.";
  return NextResponse.redirect(destination(saved.businessSlug, "success", message));
 } catch (error) {
  return NextResponse.redirect(destination(saved.businessSlug, "error", error instanceof Error ? error.message : "Google Ads connection failed."));
 }
}
