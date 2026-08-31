import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { getAccessibleMetaAdAccounts, selectMetaAdsAccount } from "@/lib/metaAdsManagement";
import { requireWorkspace } from "@/lib/workspace";

export async function POST(request: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { business, role, user } = await requireWorkspace(businessSlug);
  if (!canManageBusiness(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const contentType = request.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await request.json().catch(() => ({}))
    : Object.fromEntries(await request.formData().catch(() => new FormData()));
  const adAccountId = String((body as any).adAccountId ?? "").trim();
  if (!adAccountId) return NextResponse.json({ error: "Choose an ad account." }, { status: 400 });
  const accounts = await getAccessibleMetaAdAccounts({ businessId: business.id, businessSlug: business.slug });
  const selected = accounts.find((account) => account.accountId === adAccountId || account.id === adAccountId);
  if (!selected) return NextResponse.json({ error: "That Meta ad account is not available for this tenant." }, { status: 404 });
  await selectMetaAdsAccount({
    businessId: business.id,
    businessSlug: business.slug,
    actorUserId: user.id,
    adAccountId: selected.accountId,
    adAccountName: selected.name,
    businessManagerId: selected.businessManagerId,
  });
  return NextResponse.json({ ok: true });
}
