import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { isServonasPlatformAdmin, platformAdminRole } from "@/lib/platformAccess";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { completeGoogleAdsOauth, recordGoogleAdsBetaEvent, storeGoogleAdsConnection, writeGoogleAdsAuditLog } from "@/lib/googleAdsManagement";

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
  const { data: existingConnection } = await supabase
   .from("business_google_ads_connections")
   .select("google_ads_customer_id")
   .eq("business_id", saved.businessId)
   .maybeSingle();
  await storeGoogleAdsConnection({
   businessId: saved.businessId,
   userId: user.id,
   refreshToken: result.refreshToken,
   customers: result.customers,
   rootCustomers: result.rootCustomers,
   authenticatedIdentity: result.authenticatedIdentity,
   selectedCustomerId: existingConnection?.google_ads_customer_id ?? null,
  });
  await writeGoogleAdsAuditLog({
   businessId: saved.businessId,
   actorUserId: user.id,
   eventType: "google_ads_connected",
   metadata: { customerCount: result.customers.length, authenticatedEmail: result.authenticatedIdentity.email, authenticatedName: result.authenticatedIdentity.name },
  });
  await recordGoogleAdsBetaEvent({
   businessId: saved.businessId,
   actorUserId: user.id,
   eventName: "google_ads_connected",
   metadata: { business_slug: saved.businessSlug, customer_count: result.customers.length, authenticated_email: result.authenticatedIdentity.email, authenticated_name: result.authenticatedIdentity.name, timestamp: new Date().toISOString() },
  });
  if (!result.customers.length) {
   await recordGoogleAdsBetaEvent({
    businessId: saved.businessId,
    actorUserId: user.id,
    eventName: "google_ads_account_missing",
    metadata: { business_slug: saved.businessSlug, timestamp: new Date().toISOString() },
   });
  }
  const message = result.customers.length === 1
   ? `Google Ads connected. Account ${result.customers[0].label} is ready.`
   : "Google Ads connected. Select which Google Ads account this business should use.";
  return NextResponse.redirect(destination(saved.businessSlug, "success", message));
 } catch (error) {
  return NextResponse.redirect(destination(saved.businessSlug, "error", error instanceof Error ? error.message : "Google Ads connection failed."));
 }
}
