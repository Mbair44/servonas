import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "./supabaseServer";
export async function requireWorkspace(slug: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/${slug}`)}`);
  const { data: business, error } = await supabase.from("businesses").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`Unable to load workspace: ${error.message}`);
  if (!business) notFound();
  const { data: membership, error: membershipError } = await supabase.from("business_members").select("role").eq("business_id", business.id).eq("user_id", user.id).maybeSingle();
  if (membershipError) throw new Error(`Unable to verify workspace access: ${membershipError.message}`);
  if (!membership) notFound();
  return { supabase, user, business, role: membership.role as string };
}
