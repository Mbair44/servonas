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
  if (business.owner_user_id === user.id) {
    const { data: ownerMembership } = await supabase.from("business_members").select("role")
      .eq("business_id", business.id).eq("user_id", user.id).maybeSingle();
    if (ownerMembership?.role !== "owner") {
      console.warn("Business owner membership role is inconsistent", {
        actorUserId: user.id,
        businessId: business.id,
        membershipRole: ownerMembership?.role ?? null,
      });
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error("Business owner membership repair is unavailable.");
      const { error: repairError } = await admin.from("business_members").upsert({
        business_id: business.id,
        user_id: user.id,
        role: "owner",
      }, { onConflict: "business_id,user_id" });
      if (repairError) {
        console.error("Business owner membership repair failed", {
          code: repairError.code,
          actorUserId: user.id,
          businessId: business.id,
        });
        throw new Error("Business owner permissions could not be repaired.");
      }
      console.info("Business owner membership role repaired", {
        actorUserId: user.id,
        businessId: business.id,
      });
    }
    return { supabase, user, business, role: "owner", isPlatformAdmin: false };
  }
  const { data: membership, error: membershipError } = await supabase.from("business_members").select("role").eq("business_id", business.id).eq("user_id", user.id).maybeSingle();
  if (membershipError) throw new Error(`Unable to verify workspace access: ${membershipError.message}`);
  if (!membership) notFound();
  return { supabase, user, business, role: membership.role as string, isPlatformAdmin: false };
}
