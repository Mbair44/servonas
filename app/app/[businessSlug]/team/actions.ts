"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { classifyInvitationDelivery, invitationDeliveryMessage, type InvitationDeliveryOutcome } from "@/lib/invitationDelivery";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

const value = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

function supabaseInvitationErrorDetails(error: unknown) {
  const authError = error as Error & {
    code?: string;
    status?: number;
    response?: unknown;
    cause?: unknown;
    toJSON?: () => unknown;
  };
  let jsonString: string;
  try {
    jsonString = JSON.stringify(error);
  } catch (serializationError) {
    jsonString = `[JSON.stringify failed: ${serializationError instanceof Error ? serializationError.message : String(serializationError)}]`;
  }

  return {
    message: authError?.message ?? String(error),
    status: authError?.status,
    code: authError?.code,
    name: authError?.name,
    stack: authError?.stack,
    jsonString,
    rawError: error,
  };
}

type InvitationDeliveryResult = {
  outcome: InvitationDeliveryOutcome;
  errorMessage?: string;
};

async function siteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const requestOrigin = (await headers()).get("origin");
  const candidate = (configured || requestOrigin || "http://localhost:3000").replace(/\/$/, "");
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : "http://localhost:3000";
  } catch {
    console.error("Invitation site URL is invalid", { configured: Boolean(configured), hasRequestOrigin: Boolean(requestOrigin) });
    return "http://localhost:3000";
  }
}

async function deliverInvitation({
  email, businessName, redirectTo, businessId, invitationId,
}: {
  email: string; businessName: string; redirectTo: string; businessId: string; invitationId: string;
}): Promise<InvitationDeliveryResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.warn("Invitation email not attempted", { reason: "supabase_admin_not_configured", businessId, invitationId });
    return { outcome: classifyInvitationDelivery({ adminConfigured: false, hasAuthUser: false, hasError: false }) };
  }
  try {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { business_name: businessName },
    });
    const user = data?.user;
    const outcome = classifyInvitationDelivery({
      adminConfigured: true,
      hasAuthUser: Boolean(user?.id),
      hasError: Boolean(error),
    });
    if (error) {
      const details = supabaseInvitationErrorDetails(error);
      console.error("Supabase Auth invitation failed — complete error diagnostics", {
        provider: "supabase_auth",
        businessId,
        invitationId,
        message: details.message,
        status: details.status,
        code: details.code,
        name: details.name,
        stack: details.stack,
        jsonString: details.jsonString,
        rawError: details.rawError,
        authUserCreated: Boolean(user?.id),
        redirectTo,
      }, error);
      return { outcome, errorMessage: details.message };
    } else {
      console.info("Supabase Auth invitation result", {
        provider: "supabase_auth",
        businessId,
        invitationId,
        authUserId: user?.id,
        invitedAt: user?.invited_at,
        confirmationSentAt: user?.confirmation_sent_at,
        messageId: null,
        redirectTo,
      });
    }
    return { outcome };
  } catch (error) {
    const details = supabaseInvitationErrorDetails(error);
    console.error("Supabase Auth invitation request threw — complete error diagnostics", {
      provider: "supabase_auth",
      businessId,
      invitationId,
      message: details.message,
      status: details.status,
      code: details.code,
      name: details.name,
      stack: details.stack,
      jsonString: details.jsonString,
      rawError: details.rawError,
      redirectTo,
    }, error);
    return { outcome: "failed", errorMessage: details.message };
  }
}

async function invitationContext(businessSlug: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/app/${businessSlug}`);
  const { data: business } = await supabase.from("businesses").select("id,name").eq("slug", businessSlug).maybeSingle();
  if (!business) redirect("/app");
  const { data: membership } = await supabase.from("business_members").select("role").eq("business_id", business.id).eq("user_id", user.id).maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    redirect(`/app/${businessSlug}?teamError=${encodeURIComponent("Only owners and admins can invite team members.")}`);
  }
  return { supabase, user, business };
}

export async function inviteTeamMember(businessSlug: string, formData: FormData) {
  const { supabase, user, business } = await invitationContext(businessSlug);
  const email = value(formData, "email").toLowerCase();
  const role = value(formData, "role");
  if (!email.includes("@") || !["admin", "manager", "staff"].includes(role)) {
    redirect(`/app/${businessSlug}?teamError=${encodeURIComponent("Enter a valid email and role.")}`);
  }
  const { data: invitation, error } = await supabase.from("business_invitations").upsert({
    business_id: business.id, email, role, invited_by: user.id,
    accepted_at: null, accepted_by: null,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  }, { onConflict: "business_id,email" }).select("id,token").single();
  if (error || !invitation) {
    console.error("Business invitation save failed", { code: error?.code, businessId: business.id });
    redirect(`/app/${businessSlug}?teamError=${encodeURIComponent("The invitation could not be saved.")}`);
  }
  const origin = await siteOrigin();
  const next = `/invite/accept?token=${invitation.token}`;
  const redirectTo = `${origin}/auth/invite-callback?next=${encodeURIComponent(next)}`;
  const delivery = await deliverInvitation({
    email, businessName: business.name, redirectTo,
    businessId: business.id, invitationId: invitation.id,
  });
  revalidatePath(`/app/${businessSlug}`);
  const resultKey = delivery.errorMessage ? "teamError" : "teamSuccess";
  const resultMessage = delivery.errorMessage ?? invitationDeliveryMessage(delivery.outcome);
  redirect(`/app/${businessSlug}?${resultKey}=${encodeURIComponent(resultMessage)}&inviteLink=${encodeURIComponent(`${origin}${next}`)}`);
}

export async function resendInvitation(businessSlug: string, formData: FormData) {
  const { supabase, business } = await invitationContext(businessSlug);
  const invitationId = value(formData, "invitationId");
  const { data: invitation } = await supabase.from("business_invitations").select("id,email,token,accepted_at").eq("id", invitationId).eq("business_id", business.id).maybeSingle();
  if (!invitation || invitation.accepted_at) {
    redirect(`/app/${businessSlug}?teamError=${encodeURIComponent("Pending invitation not found.")}`);
  }
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { error } = await supabase.from("business_invitations").update({ expires_at: expiresAt }).eq("id", invitation.id).eq("business_id", business.id);
  if (error) redirect(`/app/${businessSlug}?teamError=${encodeURIComponent("The invitation could not be renewed.")}`);
  const origin = await siteOrigin();
  const next = `/invite/accept?token=${invitation.token}`;
  const delivery = await deliverInvitation({
    email: invitation.email, businessName: business.name,
    redirectTo: `${origin}/auth/invite-callback?next=${encodeURIComponent(next)}`,
    businessId: business.id, invitationId: invitation.id,
  });
  revalidatePath(`/app/${businessSlug}`);
  const resultKey = delivery.errorMessage ? "teamError" : "teamSuccess";
  const resultMessage = delivery.errorMessage ?? invitationDeliveryMessage(delivery.outcome);
  redirect(`/app/${businessSlug}?${resultKey}=${encodeURIComponent(resultMessage)}&inviteLink=${encodeURIComponent(`${origin}${next}`)}`);
}

export async function revokeInvitation(businessSlug: string, formData: FormData) {
  const { supabase, business } = await invitationContext(businessSlug);
  const invitationId = value(formData, "invitationId");
  const { error } = await supabase.from("business_invitations").delete().eq("id", invitationId).eq("business_id", business.id);
  if (error) {
    console.error("Business invitation revoke failed", { code: error.code, businessId: business.id, invitationId });
    redirect(`/app/${businessSlug}?teamError=${encodeURIComponent("The invitation could not be revoked.")}`);
  }
  revalidatePath(`/app/${businessSlug}`);
  redirect(`/app/${businessSlug}?teamSuccess=${encodeURIComponent("Invitation revoked.")}`);
}
