import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { googleAdsOauthUrl, createGoogleAdsOauthState, recordGoogleAdsBetaEvent } from "@/lib/googleAdsManagement";
import { requireWorkspace } from "@/lib/workspace";

const target = (slug: string, message: string) =>
 new URL(`/app/${encodeURIComponent(slug)}/marketing/google-ads?error=${encodeURIComponent(message)}`, process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com");

export async function GET(request: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
 const { businessSlug } = await params;
 const popup = new URL(request.url).searchParams.get("popup") === "1";
 const { business, role, user } = await requireWorkspace(businessSlug);
 if (!canManageBusiness(role)) return NextResponse.redirect(target(businessSlug, "Only owners and administrators can connect Google Ads."));
 try {
  await recordGoogleAdsBetaEvent({ businessId: business.id, actorUserId: user.id, eventName: "google_ads_oauth_started", metadata: { business_slug: business.slug, timestamp: new Date().toISOString() } });
  const payload = createGoogleAdsOauthState(businessSlug, business.id, user.id, popup);
  const store = await cookies();
  store.set("servonas_google_ads_oauth", JSON.stringify(payload), {
   httpOnly: true,
   secure: process.env.NODE_ENV === "production",
   sameSite: "lax",
   path: "/api/google-ads",
   maxAge: 600,
  });
  return NextResponse.redirect(googleAdsOauthUrl(payload.state, { forceAccountSelection: true }));
 } catch (error) {
  return NextResponse.redirect(target(businessSlug, error instanceof Error ? error.message : "Google Ads OAuth is not configured."));
 }
}
