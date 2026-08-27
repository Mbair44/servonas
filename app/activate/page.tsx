import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { activateAdminCreatedOwner } from "@/app/app/admin/businesses/actions";

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string; error?: string }>;
}) {
  const query = await searchParams;
  if (!query.business) redirect("/app");
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Activation is unavailable.");
  const { data: business } = await admin
    .from("businesses")
    .select("id,name,slug")
    .eq("slug", query.business)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!business) redirect("/app");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/activate?business=${query.business}`)}`);
  return <main className="auth-page"><section className="auth-card"><span className="sv-kicker">Welcome to Servonas</span><h1>Activate your account</h1><p>Your business has already been set up. Create your password to access <strong>{business.name}</strong>.</p>{query.error && <p className="auth-error">{query.error}</p>}<form action={activateAdminCreatedOwner} className="auth-form"><input type="hidden" name="businessSlug" value={business.slug} /><label>Password<input type="password" name="password" minLength={8} required /></label><label>Confirm password<input type="password" name="confirmPassword" minLength={8} required /></label><button className="sv-button sv-full">Activate Account</button></form></section></main>;
}
