"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function safeToken(formData: FormData) {
  return String(formData.get("token") ?? "").trim();
}

async function getInvitation(token: string) {
  const admin = getSupabaseAdmin();
  if (!admin || !token) return null;

  const { data } = await admin
    .from("business_invitations")
    .select("email, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (!data || data.accepted_at || new Date(data.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return data;
}

export async function continueInvitation(formData: FormData) {
  const token = safeToken(formData);
  const destination = String(formData.get("destination") ?? "signup") === "login" ? "login" : "signup";
  const invitation = await getInvitation(token);

  if (!invitation) {
    redirect(`/invite/accept?token=${encodeURIComponent(token)}&error=${encodeURIComponent("This invitation is invalid or expired.")}`);
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const next = `/invite/accept?token=${token}`;
  redirect(`/${destination}?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invitation.email)}`);
}

export async function acceptInvitation(formData: FormData) {
  const token = safeToken(formData);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const invitation = await getInvitation(token);
    const email = invitation?.email ?? "";
    redirect(`/signup?next=${encodeURIComponent(`/invite/accept?token=${token}`)}&email=${encodeURIComponent(email)}`);
  }

  const invitation = await getInvitation(token);
  if (!invitation) {
    redirect(`/invite/accept?token=${encodeURIComponent(token)}&error=${encodeURIComponent("This invitation is invalid or expired.")}`);
  }

  if ((user.email ?? "").toLowerCase() !== invitation.email.toLowerCase()) {
    redirect(`/invite/accept?token=${encodeURIComponent(token)}&error=${encodeURIComponent(`This invitation was sent to ${invitation.email}. Please continue with that email.`)}`);
  }

  const { data, error } = await supabase.rpc("accept_business_invitation", { p_token: token });
  if (error) {
    console.error("Business invitation acceptance failed", {
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    redirect(`/invite/accept?token=${encodeURIComponent(token)}&error=${encodeURIComponent("The invitation could not be accepted. Please try again or ask the company administrator to resend it.")}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.business_slug) {
    console.error("Business invitation acceptance returned no workspace", { hasData: Boolean(data) });
    redirect(`/invite/accept?token=${encodeURIComponent(token)}&error=${encodeURIComponent("The invitation was accepted, but the workspace could not be opened.")}`);
  }
  redirect(`/app/${row.business_slug}?joined=1`);
}
