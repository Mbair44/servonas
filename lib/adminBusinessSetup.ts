import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isServonasPlatformAdmin } from "@/lib/platformAccess";
export { businessAdminStatus, normalizeCustomerType, ownerAccessLabel, type CustomerType, type OwnerAccessStatus } from "@/lib/adminBusinessSetupState";

export async function requirePlatformAdminSession() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/admin/businesses");
  if (!isServonasPlatformAdmin(user)) redirect("/app");
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Platform administration is unavailable.");
  return { supabase, admin, user };
}

export async function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const requestOrigin = (await headers()).get("origin");
  const candidate = (configured || requestOrigin || "http://localhost:3000").replace(/\/$/, "");
  try {
    const parsed = new URL(candidate);
    return parsed.origin;
  } catch {
    return "http://localhost:3000";
  }
}
