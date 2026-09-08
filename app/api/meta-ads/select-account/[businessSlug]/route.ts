import { NextResponse } from "next/server";
import { canManageBusiness } from "@/lib/access";
import { getAccessibleMetaAdAccounts, selectMetaAdsAccount } from "@/lib/metaAdsManagement";
import { requireWorkspace } from "@/lib/workspace";

const destination = (slug: string, kind: "success" | "error", message: string) =>
  new URL(`/app/${encodeURIComponent(slug)}/marketing/meta-ads?${kind}=${encodeURIComponent(message)}`, process.env.NEXT_PUBLIC_APP_URL || "https://servonas.com");

export async function POST(request: Request, { params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { business, role, user } = await requireWorkspace(businessSlug);
  if (!canManageBusiness(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const contentType = request.headers.get("content-type") || "";
  const jsonRequest = contentType.includes("application/json");
  const respond = (kind: "success" | "error", message: string, status: number) => jsonRequest
    ? NextResponse.json(kind === "success" ? { ok: true, message } : { error: message }, { status })
    : NextResponse.redirect(destination(businessSlug, kind, message), 303);
  const body = contentType.includes("application/json")
    ? await request.json().catch(() => ({}))
    : Object.fromEntries(await request.formData().catch(() => new FormData()));
  const adAccountId = String((body as any).adAccountId ?? "").trim();
  if (!adAccountId) return respond("error", "Choose a Meta ad account.", 400);
  try {
    const accounts = await getAccessibleMetaAdAccounts({ businessId: business.id, businessSlug: business.slug });
    const selected = accounts.find((account) => account.accountId === adAccountId || account.id === adAccountId);
    if (!selected) return respond("error", "That Meta ad account is not available for this tenant.", 404);
    await selectMetaAdsAccount({
      businessId: business.id,
      businessSlug: business.slug,
      actorUserId: user.id,
      adAccountId: selected.accountId,
      adAccountName: selected.name,
      businessManagerId: selected.businessManagerId,
    });
    return respond("success", `${selected.name} is now the selected Meta ad account.`, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Meta ad account could not be selected.";
    console.error("Meta Ads account selection failed", {
      provider: "meta",
      stage: "account_selection",
      businessId: business.id,
      businessSlug: business.slug,
      message,
    });
    return respond("error", message, 500);
  }
}
