import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { completeMetaAdsOauth, getAccessibleMetaAdAccounts, persistMetaAdsConnection } from "@/lib/metaAdsManagement";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

const destination = (slug: string, kind: "success" | "error", message: string) =>
  new URL(`/app/${encodeURIComponent(slug)}/marketing/meta-ads?${kind}=${encodeURIComponent(message)}`, process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com");

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const raw = store.get("servonas_meta_ads_oauth")?.value;
  store.delete("servonas_meta_ads_oauth");
  let saved: { state: string; businessSlug: string; businessId: string; actorUserId?: string | null } | null = null;
  try { saved = raw ? JSON.parse(raw) : null; } catch {}
  if (!saved || !state || state !== saved.state || !code) {
    return NextResponse.redirect(destination(saved?.businessSlug || "", "error", "Meta Ads authorization could not be verified."));
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(destination(saved.businessSlug, "error", "Sign in to Servonas again, then reconnect Meta Ads."));
  if (saved.actorUserId && saved.actorUserId !== user.id) {
    return NextResponse.redirect(destination(saved.businessSlug, "error", "Meta Ads reconnect must be completed by the Servonas user who started it. Please reconnect again."));
  }
  const { data: business } = await supabase.from("businesses").select("owner_user_id").eq("id", saved.businessId).maybeSingle();
  const { data: membership } = await supabase.from("business_members").select("role").eq("business_id", saved.businessId).eq("user_id", user.id).maybeSingle();
  const resolvedRole = business?.owner_user_id === user.id ? "owner" : typeof membership?.role === "string" ? membership.role : null;
  if (!canManageBusiness(resolvedRole)) {
    return NextResponse.redirect(destination(saved.businessSlug, "error", "Meta Ads authorization is not permitted for this workspace."));
  }
  try {
    const result = await completeMetaAdsOauth(code, { businessId: saved.businessId, businessSlug: saved.businessSlug });
    const accounts = await getAccessibleMetaAdAccounts({ accessToken: result.accessToken, businessId: saved.businessId, businessSlug: saved.businessSlug });
    const selected = accounts.length === 1 ? accounts[0] : null;
    await persistMetaAdsConnection({
      businessId: saved.businessId,
      businessSlug: saved.businessSlug,
      actorUserId: user.id,
      metaUserId: result.metaUserId,
      adAccountId: selected?.accountId ?? null,
      adAccountName: selected?.name ?? null,
      businessManagerId: selected?.businessManagerId ?? null,
      accessToken: result.accessToken,
      expiresAt: result.expiresAt,
      scopesGranted: result.scopesGranted,
      status: selected ? "connected_never_synced" : "connected_never_synced",
    });
    console.info("Meta Ads OAuth callback completed", {
      provider: "meta",
      stage: "oauth_callback",
      businessId: saved.businessId,
      businessSlug: saved.businessSlug,
      adAccountId: selected?.accountId ?? null,
      accountCount: accounts.length,
    });
    return NextResponse.redirect(destination(
      saved.businessSlug,
      "success",
      selected ? "Meta ad account connected. Run the first sync to load spend." : "Meta authorized. Select an ad account to finish setup.",
    ));
  } catch (error) {
    return NextResponse.redirect(destination(saved.businessSlug, "error", error instanceof Error ? error.message : "Meta Ads connection failed."));
  }
}
