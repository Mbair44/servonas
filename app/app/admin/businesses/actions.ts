"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { invitationDeliveryMessage } from "@/lib/invitationDelivery";
import { validWorkspaceSlug } from "@/lib/access";
import {
  normalizeCustomerType,
  requirePlatformAdminSession,
  siteOrigin,
  type OwnerAccessStatus,
} from "@/lib/adminBusinessSetup";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);

function normalizeSlug(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}

function target(path: string, kind: "error" | "success", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${kind}=${encodeURIComponent(message)}`;
}

export async function createAdminBusiness(formData: FormData) {
  const { admin, user } = await requirePlatformAdminSession();
  const businessName = text(formData, "businessName");
  const ownerEmail = text(formData, "ownerEmail").toLowerCase();
  const ownerFirstName = text(formData, "ownerFirstName");
  const ownerLastName = text(formData, "ownerLastName");
  const customerType = normalizeCustomerType(text(formData, "customerType"));
  const slug = normalizeSlug(text(formData, "slug") || businessName);
  if (businessName.length < 2 || !ownerEmail || !validWorkspaceSlug(slug)) {
    redirect(target("/app/admin/businesses/new", "error", "Business name, owner email, and a valid workspace URL are required."));
  }
  const { data: existingProfile } = await admin.from("profiles").select("id").ilike("email", ownerEmail).maybeSingle();
  if (existingProfile?.id) {
    redirect(target("/app/admin/businesses/new", "error", "This email already has a Servonas account. Review the existing account before attaching it to a business."));
  }
  const payload = {
    p_name: businessName,
    p_slug: slug,
    p_owner_email: ownerEmail,
    p_owner_first_name: ownerFirstName || null,
    p_owner_last_name: ownerLastName || null,
    p_owner_phone: text(formData, "ownerPhone") || null,
    p_business_email: text(formData, "businessEmail") || null,
    p_business_phone: text(formData, "businessPhone") || null,
    p_website_url: text(formData, "websiteUrl") || null,
    p_city: text(formData, "city") || null,
    p_state: text(formData, "state") || null,
    p_postal_code: text(formData, "postalCode") || null,
    p_service_area: text(formData, "serviceArea") || null,
    p_timezone: text(formData, "timezone") || "America/Phoenix",
    p_industry: text(formData, "industry") || null,
    p_customer_type: customerType,
    p_internal_admin_notes: text(formData, "internalAdminNotes") || null,
    p_created_by: user.id,
  };
  const { data, error } = await admin.rpc("admin_create_business_setup", payload);
  if (error) {
    console.error("Admin business creation failed", { code: error.code, message: error.message });
    const message = error.code === "23505"
      ? "That business name, workspace URL, or owner email is already in use."
      : "The business could not be created.";
    redirect(target("/app/admin/businesses/new", "error", message));
  }
  const created = Array.isArray(data) ? data[0] : data;
  if (!created?.slug) {
    redirect(target("/app/admin/businesses/new", "error", "The business was created, but the workspace could not be opened."));
  }
  revalidatePath("/app/admin/businesses");
  redirect(`/app/admin/businesses/${created.id}?success=${encodeURIComponent("Business created. You can finish setup before inviting the owner.")}`);
}

export async function updateAdminBusinessDetails(formData: FormData) {
  const { admin, user } = await requirePlatformAdminSession();
  const businessId = text(formData, "businessId");
  if (!uuid(businessId)) redirect(target("/app/admin/businesses", "error", "Invalid business."));
  const { error } = await admin.rpc("admin_update_business_setup", {
    p_business_id: businessId,
    p_name: text(formData, "businessName") || null,
    p_industry: text(formData, "industry") || null,
    p_business_phone: text(formData, "businessPhone") || null,
    p_business_email: text(formData, "businessEmail") || null,
    p_website_url: text(formData, "websiteUrl") || null,
    p_city: text(formData, "city") || null,
    p_state: text(formData, "state") || null,
    p_postal_code: text(formData, "postalCode") || null,
    p_service_area: text(formData, "serviceArea") || null,
    p_timezone: text(formData, "timezone") || null,
    p_owner_first_name: text(formData, "ownerFirstName") || null,
    p_owner_last_name: text(formData, "ownerLastName") || null,
    p_owner_email: text(formData, "ownerEmail").toLowerCase() || null,
    p_owner_phone: text(formData, "ownerPhone") || null,
    p_customer_type: normalizeCustomerType(text(formData, "customerType")),
    p_internal_admin_notes: text(formData, "internalAdminNotes") || null,
    p_updated_by: user.id,
  });
  if (error) {
    console.error("Admin business update failed", { businessId, code: error.code, message: error.message });
    redirect(target(`/app/admin/businesses/${businessId}`, "error", "Business details could not be saved."));
  }
  revalidatePath(`/app/admin/businesses/${businessId}`);
  revalidatePath("/app/admin/businesses");
  redirect(target(`/app/admin/businesses/${businessId}`, "success", "Business details saved."));
}

export async function sendOwnerInvitation(formData: FormData) {
  const { admin, user } = await requirePlatformAdminSession();
  const businessId = text(formData, "businessId");
  if (!uuid(businessId)) redirect(target("/app/admin/businesses", "error", "Invalid business."));
  const { data: setup } = await admin
    .from("platform_business_owner_setups")
    .select("owner_email,owner_first_name,businesses!inner(name,slug)")
    .eq("business_id", businessId)
    .maybeSingle();
  if (!setup?.owner_email) {
    redirect(target(`/app/admin/businesses/${businessId}`, "error", "Add the owner email before sending an invitation."));
  }
  const business = Array.isArray(setup.businesses) ? setup.businesses[0] : setup.businesses;
  const redirectTo = `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(`/activate?business=${business.slug}`)}`;
  const invitationLink = `${await siteOrigin()}/activate?business=${encodeURIComponent(business.slug)}`;
  const { data: authInvite, error: authError } = await admin.auth.admin.inviteUserByEmail(setup.owner_email, {
    redirectTo,
    data: { business_slug: business.slug, business_name: business.name, owner_activation: true },
  });
  const outcome = !authError && authInvite?.user?.id ? "sent" : "failed";
  const ownerStatus: OwnerAccessStatus = outcome === "sent" ? "invited" : "not_invited";
  const invitedAt = outcome === "sent" ? new Date().toISOString() : null;
  const { error: updateError } = await admin.rpc("admin_mark_owner_invitation_status", {
    p_business_id: businessId,
    p_owner_status: ownerStatus,
    p_owner_invited_at: invitedAt,
    p_owner_activation_link: outcome === "sent" ? invitationLink : null,
    p_changed_by: user.id,
  });
  if (authError || updateError) {
    console.error("Owner invitation failed", {
      businessId,
      authCode: authError?.code,
      authMessage: authError?.message,
      updateCode: updateError?.code,
    });
    redirect(target(`/app/admin/businesses/${businessId}`, "error", "We created the business successfully, but the invitation email could not be sent. You can retry below."));
  }
  revalidatePath(`/app/admin/businesses/${businessId}`);
  revalidatePath("/app/admin/businesses");
  redirect(target(`/app/admin/businesses/${businessId}`, "success", invitationDeliveryMessage(outcome)));
}

export async function activateAdminCreatedOwner(formData: FormData) {
  const businessSlug = text(formData, "businessSlug");
  const password = text(formData, "password");
  const confirmPassword = text(formData, "confirmPassword");
  if (password.length < 8) redirect(target(`/activate?business=${businessSlug}`, "error", "Password must contain at least 8 characters."));
  if (password !== confirmPassword) redirect(target(`/activate?business=${businessSlug}`, "error", "Passwords do not match."));
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/activate?business=${businessSlug}`)}`);
  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) redirect(target(`/activate?business=${businessSlug}`, "error", "The password could not be saved."));
  const admin = getSupabaseAdmin();
  if (!admin) redirect(target(`/activate?business=${businessSlug}`, "error", "Activation is temporarily unavailable."));
  const { data: business } = await admin.from("businesses").select("id,slug").eq("slug", businessSlug).eq("is_deleted", false).maybeSingle();
  if (!business) redirect(target("/app", "error", "Business not found."));
  const { error } = await admin.rpc("activate_admin_created_business_owner", {
    p_business_id: business.id,
    p_user_id: user.id,
    p_user_email: (user.email ?? "").toLowerCase(),
  });
  if (error) {
    console.error("Owner activation failed", { businessId: business.id, code: error.code, message: error.message });
    redirect(target(`/activate?business=${businessSlug}`, "error", "This activation link is invalid, expired, or no longer matches the invited owner."));
  }
  revalidatePath("/app");
  redirect(`/app/${business.slug}?activated=1`);
}
