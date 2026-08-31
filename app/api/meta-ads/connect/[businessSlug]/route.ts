import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { createMetaAdsOauthState, metaAdsOauthUrl } from "@/lib/metaAdsManagement";
import { requireWorkspace } from "@/lib/workspace";

const target = (slug: string, message: string) =>
  new URL(`/app/${encodeURIComponent(slug)}/marketing/meta-ads?error=${encodeURIComponent(message)}`, process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com");

export async function GET(_: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { business, role, user } = await requireWorkspace(businessSlug);
  if (!canManageBusiness(role)) return NextResponse.redirect(target(businessSlug, "Only owners and administrators can connect Meta Ads."));
  const payload = createMetaAdsOauthState(businessSlug, business.id, user.id);
  console.info("Meta Ads OAuth started", {
    provider: "meta",
    stage: "oauth_start",
    businessId: business.id,
    businessSlug: business.slug,
  });
  const store = await cookies();
  store.set("servonas_meta_ads_oauth", JSON.stringify(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/meta-ads",
    maxAge: 600,
  });
  return NextResponse.redirect(metaAdsOauthUrl(payload.state));
}
