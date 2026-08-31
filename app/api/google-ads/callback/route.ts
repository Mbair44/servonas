import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { isServonasPlatformAdmin, platformAdminRole } from "@/lib/platformAccess";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { completeGoogleAdsOauth, discoverGoogleAdsAccounts, googleAdsRedirectUri, persistGoogleAdsOauthConnection, recordGoogleAdsBetaEvent, writeGoogleAdsAuditLog } from "@/lib/googleAdsManagement";

const destination = (slug: string, kind: "success" | "error", message: string) =>
 new URL(`/app/${encodeURIComponent(slug)}/marketing/google-ads?${kind}=${encodeURIComponent(message)}`, process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com");

const popupCompletionHtml = (redirectUrl: string, ok: boolean, message: string) => `<!doctype html>
<html lang="en">
 <head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Google Ads setup</title>
  <style>
   body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#f6f7fb;color:#17203a;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
   main{width:min(420px,100%);display:grid;gap:12px;padding:28px;border:1px solid #dbe4f0;border-radius:24px;background:#fff;box-shadow:0 24px 60px rgba(15,23,42,.12);text-align:center}
   h1{margin:0;font-size:1.4rem}
   p{margin:0;color:#667085;line-height:1.5}
   a{color:#155eef;font-weight:700}
  </style>
 </head>
 <body>
  <main>
   <h1>${ok ? "Google Ads connected" : "Google Ads setup needs attention"}</h1>
   <p>${message}</p>
   <p>You can close this window if it does not close automatically.</p>
   <p><a href="${redirectUrl}">Return to Servonas</a></p>
  </main>
  <script>
   (function(){
    var payload={type:"servonas:google-ads-oauth-complete",ok:${ok ? "true" : "false"},redirectUrl:${JSON.stringify(redirectUrl)}};
    try{
     if(window.opener&&!window.opener.closed)window.opener.postMessage(payload,window.location.origin);
    }catch(error){}
    window.setTimeout(function(){window.location.replace(${JSON.stringify(redirectUrl)});},1500);
    window.setTimeout(function(){window.close();},200);
   })();
  </script>
 </body>
</html>`;

const popupResponse = (redirectUrl: string, ok: boolean, message: string) =>
 new NextResponse(popupCompletionHtml(redirectUrl, ok, message), {
  status: 200,
  headers: {
   "Content-Type": "text/html; charset=utf-8",
   "Cache-Control": "no-store",
  },
 });

export async function GET(request: NextRequest) {
 const url = new URL(request.url);
 const code = url.searchParams.get("code");
 const state = url.searchParams.get("state");
 const store = await cookies();
 const raw = store.get("servonas_google_ads_oauth")?.value;
 store.delete("servonas_google_ads_oauth");
 let saved: { state: string; businessSlug: string; businessId: string; actorUserId?: string | null; popup?: boolean } | null = null;
 try { saved = raw ? JSON.parse(raw) : null; } catch {}
 if (!saved || !state || state !== saved.state || !code) {
  const redirectUrl = destination(saved?.businessSlug || "", "error", "Google Ads authorization could not be verified.").toString();
  return saved?.popup ? popupResponse(redirectUrl, false, "Google Ads authorization could not be verified.") : NextResponse.redirect(redirectUrl);
 }
 const supabase = await createSupabaseServerClient();
 const { data: { user } } = await supabase.auth.getUser();
 console.info("Google Ads callback workspace authorization started", {
  stage: "workspace_authorization",
  businessId: saved.businessId,
  businessSlug: saved.businessSlug,
  hasSessionUser: Boolean(user),
  hasSavedActorUserId: Boolean(saved.actorUserId),
 });
 if (!user) {
  const redirectUrl = destination(saved.businessSlug, "error", "Sign in to Servonas again, then reconnect Google Ads.").toString();
  return saved.popup ? popupResponse(redirectUrl, false, "Sign in to Servonas again, then reconnect Google Ads.") : NextResponse.redirect(redirectUrl);
 }
 if (saved.actorUserId && saved.actorUserId !== user.id) {
  console.warn("Google Ads callback workspace authorization rejected", {
   stage: "workspace_authorization",
   businessId: saved.businessId,
   businessSlug: saved.businessSlug,
   reason: "initiator_mismatch",
   sessionUserId: user.id,
  });
  const redirectUrl = destination(saved.businessSlug, "error", "Google Ads reconnect must be completed by the Servonas user who started it. Please reconnect again.").toString();
  return saved.popup ? popupResponse(redirectUrl, false, "Google Ads reconnect must be completed by the Servonas user who started it. Please reconnect again.") : NextResponse.redirect(redirectUrl);
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
  const redirectUrl = destination(saved.businessSlug, "error", "Google Ads authorization is not permitted for this workspace.").toString();
  return saved.popup ? popupResponse(redirectUrl, false, "Google Ads authorization is not permitted for this workspace.") : NextResponse.redirect(redirectUrl);
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
   businessSlug: saved.businessSlug,
   userId: user.id,
   refreshToken: result.refreshToken,
   authenticatedIdentity: result.authenticatedIdentity,
   status: "oauth_connected",
  });
  const discovery = await discoverGoogleAdsAccounts({
   businessId: saved.businessId,
   businessSlug: saved.businessSlug,
   userId: user.id,
   accessToken: result.accessToken,
   authenticatedEmail: result.authenticatedIdentity.email,
   authenticatedName: result.authenticatedIdentity.name,
   force: true,
   maxAttempts: 1,
  });
  console.info("Google Ads OAuth completion finished", {
   stage: "google_ads_oauth_completion",
   provider: "google_oauth",
   businessId: saved.businessId,
   businessSlug: saved.businessSlug,
   redirectUri: googleAdsRedirectUri(),
   refreshTokenReturned: true,
   accessTokenReturned: true,
   selectedCustomerId: discovery.selectedCustomerId,
   connectionStatus: discovery.status,
   rootCustomerCount: discovery.rootCustomers.length,
   customerCount: discovery.customers.length,
   managerCount: discovery.rootCustomers.filter((customer) => customer.isManager).length,
   authenticatedEmail: result.authenticatedIdentity.email,
   authenticatedNamePresent: Boolean(result.authenticatedIdentity.name),
   discoveryCompleted: discovery.ok,
   discoveryRateLimited: discovery.rateLimited,
   discoveryAttempted: true,
   directValidationAttempted: Boolean(discovery.selectedCustomerId) && discovery.rateLimited,
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
   metadata: {
    business_slug: saved.businessSlug,
    customer_count: discovery.customers.length,
    authenticated_email: result.authenticatedIdentity.email,
    authenticated_name: result.authenticatedIdentity.name,
    discovery_status: discovery.status,
    selected_customer_id: discovery.selectedCustomerId,
    selected_customer_direct_access_verified: discovery.selectedCustomerDirectAccessVerified,
    timestamp: new Date().toISOString(),
   },
  });
  if (discovery.ok && !discovery.customers.length) {
   await recordGoogleAdsBetaEvent({
    businessId: saved.businessId,
    actorUserId: user.id,
    eventName: "google_ads_account_missing",
    metadata: { business_slug: saved.businessSlug, timestamp: new Date().toISOString() },
    });
  }
  const message = discovery.userMessage;
  const redirectUrl = destination(saved.businessSlug, "success", message).toString();
  return saved.popup ? popupResponse(redirectUrl, true, message) : NextResponse.redirect(redirectUrl);
 } catch (error) {
  const message = error instanceof Error ? error.message : "Google Ads connection failed.";
  const redirectUrl = destination(saved.businessSlug, "error", message).toString();
  return saved.popup ? popupResponse(redirectUrl, false, message) : NextResponse.redirect(redirectUrl);
 }
}
