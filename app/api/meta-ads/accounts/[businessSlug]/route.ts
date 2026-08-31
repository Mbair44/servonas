import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { getAccessibleMetaAdAccounts } from "@/lib/metaAdsManagement";
import { requireWorkspace } from "@/lib/workspace";

export async function GET(_: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { business, role } = await requireWorkspace(businessSlug);
  if (!canManageBusiness(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const accounts = await getAccessibleMetaAdAccounts({ businessId: business.id, businessSlug: business.slug });
  return NextResponse.json({ accounts });
}
