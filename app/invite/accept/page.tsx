import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { acceptInvitation, continueInvitation } from "./actions";

export default async function AcceptInvite({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const query = await searchParams;
  if (!query.token) redirect("/app");

  const admin = getSupabaseAdmin();
  const { data: invite } = admin
    ? await admin
        .from("business_invitations")
        .select("email, role, expires_at, accepted_at, businesses(name, slug)")
        .eq("token", query.token)
        .maybeSingle()
    : { data: null };

  const invalid =
    !invite ||
    Boolean(invite.accepted_at) ||
    new Date(invite.expires_at).getTime() <= Date.now();

  if (invalid) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <span className="sv-kicker">Team invitation</span>
          <h1>Invitation unavailable</h1>
          <p className="auth-error">This invitation is invalid, expired, or has already been accepted.</p>
        </section>
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const invitedEmail = invite.email.toLowerCase();
  const currentEmail = (user?.email ?? "").toLowerCase();
  const businessName = (invite.businesses as any)?.name ?? "this workspace";

  if (!user) {
    redirect(
      `/signup?next=${encodeURIComponent(`/invite/accept?token=${query.token}`)}&email=${encodeURIComponent(invite.email)}`,
    );
  }

  if (currentEmail !== invitedEmail) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <span className="sv-kicker">Team invitation</span>
          <h1>Continue as the invited employee</h1>
          <p>
            This invitation to <strong>{businessName}</strong> was sent to <strong>{invite.email}</strong>,
            but you are currently signed in as <strong>{user.email}</strong>.
          </p>
          {query.error && <p className="auth-error">{query.error}</p>}
          <form action={continueInvitation} className="auth-form">
            <input type="hidden" name="token" value={query.token} />
            <button className="sv-button sv-full" name="destination" value="signup">
              Sign out and create employee account
            </button>
            <button className="sv-button sv-button-secondary sv-full" name="destination" value="login">
              Sign out and log in as employee
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="sv-kicker">Team invitation</span>
        <h1>Join {businessName}</h1>
        <p>
          You are signed in as <strong>{user.email}</strong>. Accepting adds you as a{" "}
          <strong>{invite.role ?? "team member"}</strong>.
        </p>
        {query.error && <p className="auth-error">{query.error}</p>}
        <form action={acceptInvitation}>
          <input type="hidden" name="token" value={query.token} />
          <button className="sv-button">Accept invitation</button>
        </form>
      </section>
    </main>
  );
}
