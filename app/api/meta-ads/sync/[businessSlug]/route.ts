import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { syncMetaAdsPerformance } from "@/lib/metaAdsManagement";
import { requireWorkspace } from "@/lib/workspace";

export async function POST(_: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { business, role, user } = await requireWorkspace(businessSlug);
  if (!canManageBusiness(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await syncMetaAdsPerformance({ businessId: business.id, businessSlug: business.slug, actorUserId: user.id });
  return NextResponse.json(result);
}
