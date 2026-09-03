import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { exchangeGoogleBusinessCode, listGoogleBusinessLocations } from "@/lib/googleBusinessProfile";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com";
const destination = (slug: string, kind: "success" | "error", message: string) => new URL(`/app/${encodeURIComponent(slug)}/settings/website?${kind}=${encodeURIComponent(message)}`, appUrl());
const log = (event: string, details: Record<string, unknown> = {}) => console.info(event, { provider: "google_business_profile", ...details });

export async function GET(request: Request) {
 const url = new URL(request.url);
 const code = url.searchParams.get("code");
 const state = url.searchParams.get("state");
 const store = await cookies();
 const raw = store.get("servonas_google_business_oauth")?.value;
 store.delete("servonas_google_business_oauth");
 let saved: { state: string; businessSlug: string; businessId: string } | null = null;
 try { saved = raw ? JSON.parse(raw) : null; } catch { /* invalid state cookie is treated as unverified */ }
 log("google_business_callback_started", { hasAuthorizationCode: Boolean(code), hasState: Boolean(state) });
 log("google_business_state_validation_started", { hasStateCookie: Boolean(raw) });
 if (!saved || !state || state !== saved.state || !code) {
  const redirectDestination = destination(saved?.businessSlug || "", "error", "Google authorization could not be verified.");
  log("google_business_callback_failed", { stage: "state_validation", businessId: saved?.businessId ?? null, errorCode: !saved ? "missing_or_invalid_state_cookie" : !state ? "missing_state" : state !== saved.state ? "state_mismatch" : "missing_authorization_code", errorMessage: "Google authorization could not be verified.", redirectDestination: redirectDestination.pathname });
  log("google_business_callback_redirected", { stage: "state_validation", businessId: saved?.businessId ?? null, redirectDestination: redirectDestination.pathname });
  return NextResponse.redirect(redirectDestination);
 }
 log("google_business_state_validation_completed", { businessId: saved.businessId, businessSlug: saved.businessSlug });

 const supabase = await createSupabaseServerClient();
 const { data: { user } } = await supabase.auth.getUser();
 const { data: membership } = user
  ? await supabase.from("business_members").select("role").eq("business_id", saved.businessId).eq("user_id", user.id).maybeSingle()
  : { data: null };
 if (!user || !membership || !["owner", "admin"].includes(membership.role)) {
  const redirectDestination = destination(saved.businessSlug, "error", "Google authorization is not permitted for this workspace.");
  log("google_business_callback_failed", { stage: "workspace_authorization", businessId: saved.businessId, userId: user?.id ?? null, errorCode: !user ? "missing_servonas_session" : !membership ? "workspace_membership_missing" : "workspace_role_not_permitted", errorMessage: "Google authorization is not permitted for this workspace.", redirectDestination: redirectDestination.pathname });
  log("google_business_callback_redirected", { stage: "workspace_authorization", businessId: saved.businessId, userId: user?.id ?? null, redirectDestination: redirectDestination.pathname });
  return NextResponse.redirect(redirectDestination);
 }
 log("google_business_callback_business_resolved", { businessId: saved.businessId, userId: user.id, role: membership.role });

 let stage = "token_exchange";
 try {
  log("google_business_token_exchange_started", { businessId: saved.businessId, userId: user.id, redirectUri: `${appUrl().replace(/\/$/, "")}/api/google-business/callback` });
  const token = await exchangeGoogleBusinessCode(code);
  log("google_business_token_exchange_completed", { businessId: saved.businessId, userId: user.id, hasRefreshToken: Boolean(token.refresh_token) });
  if (!token.refresh_token) throw new Error("Google did not provide long-term access. Remove Servonas from Google account permissions and connect again.");
  stage = "location_discovery";
  const locations = await listGoogleBusinessLocations(token.access_token!);
  const db = getSupabaseAdmin();
  if (!db) throw new Error("Google connection storage is unavailable.");
  const { data: business } = await db.from("businesses").select("name").eq("id", saved.businessId).maybeSingle();
  const wanted = business?.name.trim().toLowerCase();
  const matches = locations.filter((location) => location.title.trim().toLowerCase() === wanted);
  const location = matches.length === 1 ? matches[0] : locations.length === 1 ? locations[0] : null;
  if (!location) throw new Error(locations.length ? "Google returned multiple profiles and none uniquely matched this Servonas business name." : "No Google Business Profile was found for this account.");
  stage = "credential_persistence";
  const { error } = await db.from("business_google_profile_connections").upsert({ business_id: saved.businessId, connected_by: user.id, refresh_token: token.refresh_token, google_account_id: location.accountId, google_location_id: location.locationId, location_title: location.title, status: "connected", connected_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "business_id" });
  if (error) throw new Error("Google connection could not be saved. Apply the Google Business Profile migration.");
  const redirectDestination = destination(saved.businessSlug, "success", `Google Business Profile connected: ${location.title}`);
  log("google_business_callback_redirected", { stage: "success", businessId: saved.businessId, userId: user.id, redirectDestination: redirectDestination.pathname });
  return NextResponse.redirect(redirectDestination);
 } catch (error) {
  const message = error instanceof Error ? error.message : "Google Business Profile connection failed.";
  const redirectDestination = destination(saved.businessSlug, "error", message);
  log("google_business_callback_failed", { stage, businessId: saved.businessId, userId: user.id, errorCode: error instanceof Error ? error.name : "unknown", errorMessage: message, redirectDestination: redirectDestination.pathname });
  log("google_business_callback_redirected", { stage, businessId: saved.businessId, userId: user.id, redirectDestination: redirectDestination.pathname });
  return NextResponse.redirect(redirectDestination);
 }
}
