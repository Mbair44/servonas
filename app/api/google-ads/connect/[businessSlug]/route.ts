import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { googleAdsOauthUrl, createGoogleAdsOauthState, recordGoogleAdsBetaEvent } from "@/lib/googleAdsManagement";
import { requireWorkspace } from "@/lib/workspace";

const safeReturnTo=(slug:string,value:string|null)=>value?.startsWith(`/app/${encodeURIComponent(slug)}/`)&&!value.startsWith("//")?value:null;
const target = (slug: string, message: string, returnTo?:string|null) => {
 const url=new URL(returnTo||`/app/${encodeURIComponent(slug)}/marketing/google-ads`,process.env.NEXT_PUBLIC_APP_URL||"https://servonas.com");
 url.searchParams.set("error",message);return url;
};

export async function GET(request: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
 const { businessSlug } = await params;
 const requestUrl=new URL(request.url),popup=requestUrl.searchParams.get("popup") === "1",returnTo=safeReturnTo(businessSlug,requestUrl.searchParams.get("returnTo"));
 const { business, role, user } = await requireWorkspace(businessSlug);
 if (!canManageBusiness(role)) return NextResponse.redirect(target(businessSlug, "Only owners and administrators can connect Google Ads.",returnTo));
 try {
  await recordGoogleAdsBetaEvent({ businessId: business.id, actorUserId: user.id, eventName: "google_ads_oauth_started", metadata: { business_slug: business.slug, timestamp: new Date().toISOString() } });
  const payload = createGoogleAdsOauthState(businessSlug, business.id, user.id, popup, returnTo);
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
  return NextResponse.redirect(target(businessSlug, error instanceof Error ? error.message : "Google Ads OAuth is not configured.",returnTo));
 }
}
