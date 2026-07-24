"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { classifyInvitationDelivery, invitationDeliveryMessage, type InvitationDeliveryOutcome } from "@/lib/invitationDelivery";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireWorkspace } from "@/lib/workspace";

const value = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const escapeHtml = (input: string) => input.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character]!));

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

async function existingUserId(email: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (error) console.error("Invitation existing-user lookup failed", { code: error.code });
  return data?.id ?? null;
}

async function deliverExistingUserInvitation({
  email, businessName, invitationLink, redirectTo, businessId, invitationId,
}: {
  email: string; businessName: string; invitationLink: string; redirectTo: string;
  businessId: string; invitationId: string;
}): Promise<InvitationDeliveryResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.warn("Existing-user invitation email not attempted", {
      reason: "supabase_admin_not_configured", businessId, invitationId,
    });
    return { outcome: "not_configured" };
  }

  const { error: otpError } = await admin.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
      data: { business_name: businessName },
    },
  });
  if (!otpError) {
    console.info("Existing-user invitation sign-in email accepted", {
      provider: "supabase_auth", businessId, invitationId, redirectTo,
    });
    return { outcome: "sent" };
  }
  const otpDetails = supabaseInvitationErrorDetails(otpError);
  console.error("Existing-user Supabase invitation email failed", {
    provider: "supabase_auth", businessId, invitationId,
    message: otpDetails.message, status: otpDetails.status, code: otpDetails.code,
    name: otpDetails.name, jsonString: otpDetails.jsonString, redirectTo,
  });

  if (process.env.EMAIL_DELIVERY_MODE !== "live" || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return { outcome: "failed" };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [email],
        subject: `You’re invited to join ${businessName}`,
        text: `You already have a Servonas account. Sign in with this email, then accept the invitation:\n\n${invitationLink}`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Join ${escapeHtml(businessName)}</h2><p>You already have a Servonas account. Sign in with this email, then accept the invitation.</p><p><a href="${escapeHtml(invitationLink)}">Accept invitation</a></p></div>`,
      }),
    });
    const result = await response.json() as { id?: string; message?: string; name?: string; statusCode?: number };
    if (!response.ok || !result.id) {
      console.error("Existing-user invitation email failed", {
        provider: "resend", businessId, invitationId, httpStatus: response.status,
        providerStatus: result.statusCode, providerError: result.name, reason: result.message,
      });
      return { outcome: "failed" };
    }
    console.info("Existing-user invitation email sent", {
      provider: "resend", businessId, invitationId, providerMessageId: result.id,
    });
    return { outcome: "sent" };
  } catch (error) {
    console.error("Existing-user invitation email request failed", {
      businessId, invitationId, errorName: error instanceof Error ? error.name : "unknown",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { outcome: "failed" };
  }
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
  email, businessName, redirectTo, invitationLink, businessId, invitationId, userAlreadyExists,
}: {
  email: string; businessName: string; redirectTo: string; invitationLink: string;
  businessId: string; invitationId: string; userAlreadyExists: boolean;
}): Promise<InvitationDeliveryResult> {
  if (userAlreadyExists) {
    return deliverExistingUserInvitation({ email, businessName, invitationLink, redirectTo, businessId, invitationId });
  }
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
      const existingAccountError = details.code === "email_exists"
        || /already (been )?registered|already exists|email.*in use/i.test(details.message);
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
      if (existingAccountError) {
        console.info("Supabase Auth account already exists; using business invitation link delivery", {
          businessId, invitationId,
        });
        return deliverExistingUserInvitation({
          email, businessName, invitationLink, redirectTo, businessId, invitationId,
        });
      }
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
  const { supabase, user, business, role } = await requireWorkspace(businessSlug);
  if (!["owner", "admin", "platform_admin"].includes(role)) {
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
  const userId = await existingUserId(email);
  if (userId) {
    const admin = getSupabaseAdmin();
    const { data: existingMembership, error: membershipError } = await admin!.from("business_members")
      .select("user_id").eq("business_id", business.id).eq("user_id", userId).maybeSingle();
    if (membershipError) {
      console.error("Invitation membership lookup failed", { code: membershipError.code, businessId: business.id });
      redirect(`/app/${businessSlug}?teamError=${encodeURIComponent("Existing membership could not be checked.")}`);
    }
    if (existingMembership) {
      redirect(`/app/${businessSlug}?teamError=${encodeURIComponent("That user is already a member of this business.")}`);
    }
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
  const invitationLink = `${origin}${next}`;
  const redirectTo = `${origin}/auth/invite-callback?next=${encodeURIComponent(next)}`;
  const delivery = await deliverInvitation({
    email, businessName: business.name, redirectTo, invitationLink,
    businessId: business.id, invitationId: invitation.id, userAlreadyExists: Boolean(userId),
  });
  revalidatePath(`/app/${businessSlug}`);
  redirect(`/app/${businessSlug}?teamSuccess=${encodeURIComponent(invitationDeliveryMessage(delivery.outcome))}&inviteLink=${encodeURIComponent(invitationLink)}`);
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
  const invitationLink = `${origin}${next}`;
  const userId = await existingUserId(invitation.email);
  const delivery = await deliverInvitation({
    email: invitation.email, businessName: business.name,
    redirectTo: `${origin}/auth/invite-callback?next=${encodeURIComponent(next)}`,
    invitationLink, businessId: business.id, invitationId: invitation.id,
    userAlreadyExists: Boolean(userId),
  });
  revalidatePath(`/app/${businessSlug}`);
  redirect(`/app/${businessSlug}?teamSuccess=${encodeURIComponent(invitationDeliveryMessage(delivery.outcome))}&inviteLink=${encodeURIComponent(invitationLink)}`);
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
