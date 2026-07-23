"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { classifyInvitationDelivery, invitationDeliveryMessage, type InvitationDeliveryOutcome } from "@/lib/invitationDelivery";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

const value = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

function supabaseInvitationErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { errorType: typeof error, errorValue: String(error) };
  }

  const authError = error as Error & {
    code?: string;
    status?: number;
    response?: unknown;
    cause?: unknown;
    toJSON?: () => unknown;
  };
  let serialized: unknown;
  try {
    serialized = authError.toJSON?.();
  } catch {
    serialized = undefined;
  }

  return {
    errorName: authError.name,
    errorCode: authError.code,
    errorStatus: authError.status,
    errorMessage: authError.message,
    errorResponse: authError.response,
    errorCause: authError.cause instanceof Error
      ? {
          name: authError.cause.name,
          message: authError.cause.message,
          ...Object.fromEntries(Object.getOwnPropertyNames(authError.cause).map((key) => [
            key,
            (authError.cause as unknown as Record<string, unknown>)[key],
          ])),
        }
      : authError.cause,
    errorSerialized: serialized,
    errorOwnProperties: Object.fromEntries(Object.getOwnPropertyNames(authError).map((key) => [
      key,
      (authError as unknown as Record<string, unknown>)[key],
    ])),
  };
}

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
}): Promise<InvitationDeliveryOutcome> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.warn("Invitation email not attempted", { reason: "supabase_admin_not_configured", businessId, invitationId });
    return classifyInvitationDelivery({ adminConfigured: false, hasAuthUser: false, hasError: false });
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
      console.error("Supabase Auth invitation failed", {
        provider: "supabase_auth",
        businessId,
        invitationId,
        ...supabaseInvitationErrorDetails(error),
        authUserCreated: Boolean(user?.id),
        smtpDiagnostics: {
          smtpErrorCode: "not_exposed_separately_by_supabase_auth_api",
          smtpErrorMessage: "see errorMessage and errorSerialized",
          smtpResponseText: "not_exposed_separately_by_supabase_auth_api",
          smtpConnectionSucceeded: "not_exposed_by_supabase_auth_api",
          smtpAuthenticationSucceeded: "not_exposed_by_supabase_auth_api",
          senderMailboxExists: "not_exposed_by_supabase_auth_api",
          failureStage: "not_exposed_by_supabase_auth_api",
        },
        redirectTo,
      });
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
    return outcome;
  } catch (error) {
    console.error("Supabase Auth invitation request threw", {
      provider: "supabase_auth",
      businessId,
      invitationId,
      ...supabaseInvitationErrorDetails(error),
      smtpDiagnostics: {
        smtpErrorCode: "not_available_request_failed_before_a_supabase_auth_response",
        smtpErrorMessage: "see errorMessage and errorSerialized",
        smtpResponseText: "not_available_request_failed_before_a_supabase_auth_response",
        smtpConnectionSucceeded: "unknown",
        smtpAuthenticationSucceeded: "unknown",
        senderMailboxExists: "unknown",
        failureStage: "before_receiving_supabase_auth_response",
      },
      redirectTo,
    });
    return "failed";
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
  const outcome = await deliverInvitation({
    email, businessName: business.name, redirectTo,
    businessId: business.id, invitationId: invitation.id,
  });
  revalidatePath(`/app/${businessSlug}`);
  redirect(`/app/${businessSlug}?teamSuccess=${encodeURIComponent(invitationDeliveryMessage(outcome))}&inviteLink=${encodeURIComponent(`${origin}${next}`)}`);
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
  const outcome = await deliverInvitation({
    email: invitation.email, businessName: business.name,
    redirectTo: `${origin}/auth/invite-callback?next=${encodeURIComponent(next)}`,
    businessId: business.id, invitationId: invitation.id,
  });
  revalidatePath(`/app/${businessSlug}`);
  redirect(`/app/${businessSlug}?teamSuccess=${encodeURIComponent(invitationDeliveryMessage(outcome))}&inviteLink=${encodeURIComponent(`${origin}${next}`)}`);
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
