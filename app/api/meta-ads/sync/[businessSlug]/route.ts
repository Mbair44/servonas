import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { describeMetaAdsSyncFailure, syncMetaAdsPerformance } from "@/lib/metaAdsManagement";
import { requireWorkspace } from "@/lib/workspace";

export async function POST(_: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { business, role, user } = await requireWorkspace(businessSlug);
  if (!canManageBusiness(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await syncMetaAdsPerformance({ businessId: business.id, businessSlug: business.slug, actorUserId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    const failure = describeMetaAdsSyncFailure(error);
    console.error("Meta Ads sync request failed", {
      provider: "meta",
      stage: "sync_request",
      businessId: business.id,
      businessSlug: business.slug,
      operation: failure.operation,
      failureCode: failure.code,
      graphHttpStatus: failure.graphHttpStatus ?? null,
      metaErrorCode: failure.metaErrorCode ?? null,
      metaErrorSubcode: failure.metaErrorSubcode ?? null,
    });
    return NextResponse.json({ error: failure.message, code: failure.code }, { status: failure.status });
  }
}
