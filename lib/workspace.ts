import { notFound, redirect } from "next/navigation";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { createSupabaseServerClient } from "./supabaseServer";
import { isServonasPlatformAdmin, platformAdminRole } from "./platformAccess";
export async function requireWorkspace(slug: string) {
  const sessionSupabase = await createSupabaseServerClient();
  const { data: { user } } = await sessionSupabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/${slug}`)}`);
  const isPlatformAdmin = isServonasPlatformAdmin(user);
  const supabase = isPlatformAdmin ? getSupabaseAdmin() : sessionSupabase;
  if (!supabase) throw new Error("Platform administration is unavailable.");
  const { data: business, error } = await supabase.from("businesses").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`Unable to load workspace: ${error.message}`);
  if (!business) notFound();
  if (isPlatformAdmin) {
    console.info("Servonas platform administrator accessed business workspace", {
      actorUserId: user.id,
      businessId: business.id,
      businessSlug: slug,
    });
    return { supabase, user, business, role: platformAdminRole, isPlatformAdmin: true };
  }
  const { data: membership, error: membershipError } = await supabase.from("business_members").select("role").eq("business_id", business.id).eq("user_id", user.id).maybeSingle();
  if (membershipError) throw new Error(`Unable to verify workspace access: ${membershipError.message}`);
  if (!membership) notFound();
  return { supabase, user, business, role: membership.role as string, isPlatformAdmin: false };
}
