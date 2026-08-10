import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getOrCreateBusinessTwilioSubaccount } from "@/lib/twilio/businessTwilioProvider";
import { canProvisionBusinessTwilioSubaccount } from "@/lib/twilio/provisioningAccess";

export async function POST(request: Request) {
  const session = await createSupabaseServerClient();
  const { data: { user } } = await session.auth.getUser();
  if (!canProvisionBusinessTwilioSubaccount(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let businessId = "";
  try {
    const body = await request.json() as { businessId?: unknown };
    businessId = typeof body.businessId === "string" ? body.businessId.trim() : "";
  } catch {
    return NextResponse.json({ error: "A JSON request body is required." }, { status: 400 });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(businessId)) return NextResponse.json({ error: "A valid businessId is required." }, { status: 400 });
  try {
    const context = await getOrCreateBusinessTwilioSubaccount(businessId);
    return NextResponse.json({ account: context });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Twilio subaccount provisioning failed and can be retried.";
    const status = message === "Business not found." ? 404 : 502;
    console.error("Business Twilio subaccount provisioning failed", { businessId, status });
    return NextResponse.json({ error: message }, { status });
  }
}
