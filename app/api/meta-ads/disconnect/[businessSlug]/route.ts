import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { disconnectMetaAds } from "@/lib/metaAdsManagement";
import { requireWorkspace } from "@/lib/workspace";

export async function POST(_: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { business, role } = await requireWorkspace(businessSlug);
  if (!canManageBusiness(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await disconnectMetaAds(business.id);
  return NextResponse.json({ ok: true });
}
