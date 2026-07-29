"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageCustomers } from "@/lib/access";
import {
  isPotentialCustomerDuplicate,
  isValidCrmEmail,
  isValidCrmPhone,
  customerWriteErrorMessage,
} from "@/lib/crmValidation";
import { GoogleGeocodingProvider } from "@/lib/geocoding/googleProvider";
import {
  clearManualServiceLocationCoordinates,
  resolveServiceLocationAddress,
  setManualServiceLocationCoordinates,
} from "@/lib/geocoding/service";
import { requireWorkspaceCapability } from "@/lib/workspace";

export type CrmActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const valuesFrom = (formData: FormData) =>
  Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string")) as Record<string, string>;

function validateCustomer(formData: FormData) {
  const errors: Record<string, string> = {};
  const first = text(formData, "firstName");
  const email = text(formData, "email").toLowerCase();
  const phone = text(formData, "phone");
  const secondaryPhone = text(formData, "secondaryPhone");
  if (!first) errors.firstName = "Enter a first name.";
  if (!email) errors.email = "Enter an email address.";
  else if (!isValidCrmEmail(email)) errors.email = "Enter a valid email address.";
  if (!phone) errors.phone = "Enter a primary phone number.";
  else if (!isValidCrmPhone(phone)) errors.phone = "Enter a valid phone number.";
  if (!isValidCrmPhone(secondaryPhone)) errors.secondaryPhone = "Enter a valid secondary phone.";
  return errors;
}

async function duplicateWarning(
  supabase: Awaited<ReturnType<typeof requireWorkspaceCapability>>["supabase"],
  businessId: string,
  email: string,
  phone: string,
  excludeId?: string,
) {
  let query = supabase.from("customers").select("id,first_name,last_name,email,phone").eq("business_id", businessId).eq("is_deleted", false);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.limit(250);
  return (data ?? []).find((customer) =>
    isPotentialCustomerDuplicate(customer, email, phone),
  );
}

export async function createCustomer(
  slug: string,
  _state: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  if (!canManageCustomers(role)) return { error: "You do not have permission to add customers.", values: valuesFrom(formData) };
  const fieldErrors = validateCustomer(formData);
  const values = valuesFrom(formData);
  if (Object.keys(fieldErrors).length) return { error: "Please correct the highlighted fields.", fieldErrors, values };
  const email = text(formData, "email").toLowerCase();
  const phone = text(formData, "phone");
  const duplicate = await duplicateWarning(supabase, business.id, email, phone);
  if (duplicate && email && duplicate.email?.toLowerCase() === email) {
    return {
      error: `A customer with this email already exists: ${duplicate.first_name} ${duplicate.last_name}.`,
      fieldErrors: { email: "Email addresses must be unique within this business." },
      values,
    };
  }
  if (duplicate && text(formData, "confirmDuplicate") !== "true") {
    return {
      error: `Possible duplicate: ${duplicate.first_name} ${duplicate.last_name}. Review the record or submit again to create anyway.`,
      fieldErrors: { duplicate: "A customer with this email or phone already exists." },
      values: { ...values, confirmDuplicate: "true" },
    };
  }
  const { data, error } = await supabase.from("customers").insert({
    business_id: business.id,
    first_name: text(formData, "firstName"),
    last_name: text(formData, "lastName"),
    company_name: text(formData, "companyName") || null,
    email: email || null,
    phone: phone || null,
    secondary_phone: text(formData, "secondaryPhone") || null,
    preferred_contact_method: text(formData, "preferredContactMethod") || "email",
    notes: text(formData, "notes") || null,
    tags: text(formData, "tags").split(",").map((tag) => tag.trim()).filter(Boolean),
    lead_source: text(formData, "leadSource") || null,
    is_active: text(formData, "isActive") === "true",
    created_by: user.id,
    updated_by: user.id,
  }).select("id").single();
  if (error || !data) {
    console.error("CRM customer creation failed", { code: error?.code, message:error?.message, hint:error?.hint, businessId: business.id });
    return { error: customerWriteErrorMessage(error??undefined,"created"), values };
  }
  revalidatePath(`/app/${slug}/customers`);
  redirect(`/app/${slug}/customers/${data.id}?success=Customer+created`);
}

export async function updateCustomer(
  slug: string,
  customerId: string,
  _state: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  const values = valuesFrom(formData);
  if (!canManageCustomers(role)) return { error: "You do not have permission to edit customers.", values };
  const fieldErrors = validateCustomer(formData);
  if (Object.keys(fieldErrors).length) return { error: "Please correct the highlighted fields.", fieldErrors, values };
  const { data: owned } = await supabase.from("customers").select("id").eq("id", customerId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!owned) return { error: "Customer not found.", values };
  const email = text(formData, "email").toLowerCase();
  const phone = text(formData, "phone");
  const duplicate = await duplicateWarning(supabase, business.id, email, phone, customerId);
  if (duplicate && email && duplicate.email?.toLowerCase() === email) {
    return {
      error: `That email belongs to ${duplicate.first_name} ${duplicate.last_name}.`,
      fieldErrors: { email: "Email addresses must be unique within this business." },
      values,
    };
  }
  if (duplicate && text(formData, "confirmDuplicate") !== "true") {
    return { error: `Possible duplicate: ${duplicate.first_name} ${duplicate.last_name}.`, fieldErrors: { duplicate: "Confirm to save anyway." }, values: { ...values, confirmDuplicate: "true" } };
  }
  const { error } = await supabase.from("customers").update({
    first_name: text(formData, "firstName"),
    last_name: text(formData, "lastName"),
    company_name: text(formData, "companyName") || null,
    email: email || null,
    phone: phone || null,
    secondary_phone: text(formData, "secondaryPhone") || null,
    preferred_contact_method: text(formData, "preferredContactMethod") || "email",
    notes: text(formData, "notes") || null,
    tags: text(formData, "tags").split(",").map((tag) => tag.trim()).filter(Boolean),
    lead_source: text(formData, "leadSource") || null,
    is_active: text(formData, "isActive") === "true",
    updated_by: user.id,
  }).eq("id", customerId).eq("business_id", business.id);
  if (error) {
    console.error("CRM customer update failed", { code: error.code, message:error.message, hint:error.hint, businessId: business.id, customerId });
    return { error: customerWriteErrorMessage(error,"saved"), values };
  }
  revalidatePath(`/app/${slug}/customers`);
  revalidatePath(`/app/${slug}/customers/${customerId}`);
  redirect(`/app/${slug}/customers/${customerId}?success=Customer+updated`);
}

export async function archiveCustomer(slug: string, customerId: string) {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/customers/${customerId}?error=Permission+denied`);
  const { error } = await supabase.from("customers").update({ is_deleted: true, is_active: false, updated_by: user.id }).eq("id", customerId).eq("business_id", business.id);
  if (error) redirect(`/app/${slug}/customers/${customerId}?error=Customer+could+not+be+archived`);
  revalidatePath(`/app/${slug}/customers`);
  redirect(`/app/${slug}/customers?success=Customer+archived`);
}

function locationPayload(formData: FormData) {
  const placeId = text(formData, "googlePlaceId");
  if (process.env.GOOGLE_MAPS_API_KEY && !placeId) return { error: "Select an address from Google’s suggestions." };
  return {
    providerPlaceId: placeId || null,
    data: {
      location_name: text(formData, "locationName") || "Service location",
      street_address: text(formData, "streetAddress"),
      unit: text(formData, "unit") || null,
      city: text(formData, "city"),
      state: text(formData, "state"),
      postal_code: text(formData, "postalCode"),
      country: text(formData, "country") || "US",
      access_instructions: text(formData, "accessInstructions") || null,
      gate_code: text(formData, "gateCode") || null,
      parking_notes: text(formData, "parkingNotes") || null,
      pets_present: text(formData, "petsPresent") === "true",
      property_notes: text(formData, "propertyNotes") || null,
      is_primary: text(formData, "isPrimary") === "true",
      is_active: text(formData, "isActive") === "true",
    },
  };
}

export async function saveServiceLocation(
  slug: string,
  customerId: string,
  locationId: string | null,
  _state: CrmActionState,
  formData: FormData,
): Promise<CrmActionState> {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  const values = valuesFrom(formData);
  if (!canManageCustomers(role)) return { error: "You do not have permission to manage locations.", values };
  const { data: customer } = await supabase.from("customers").select("id").eq("id", customerId).eq("business_id", business.id).eq("is_deleted", false).maybeSingle();
  if (!customer) return { error: "Customer not found.", values };
  const payload = locationPayload(formData);
  const payloadError = "error" in payload ? payload.error : null;
  if (payloadError) return { error: payloadError, fieldErrors: { address: payloadError }, values };
  const locationData = "data" in payload ? payload.data : null;
  if (!locationData) return { error: "The service address could not be prepared.", values };
  if (!locationData.street_address || !locationData.city || !locationData.state || !locationData.postal_code) {
    return { error: "Complete the service address.", fieldErrors: { address: "Street, city, state, and postal code are required." }, values };
  }
  if (locationData.is_primary) {
    await supabase.from("service_locations").update({ is_primary: false, updated_by: user.id }).eq("business_id", business.id).eq("customer_id", customerId).eq("is_primary", true);
  }
  const saveResult = locationId
    ? await supabase.from("service_locations").update({ ...locationData, updated_by: user.id }).eq("id", locationId).eq("business_id", business.id).eq("customer_id", customerId).select("id").maybeSingle()
    : await supabase.from("service_locations").insert({ ...locationData, business_id: business.id, customer_id: customerId, created_by: user.id, updated_by: user.id }).select("id").single();
  if (saveResult.error || !saveResult.data) {
    console.error("CRM location save failed", { code: saveResult.error?.code, businessId: business.id, customerId, locationId });
    return { error: "The service location could not be saved.", values };
  }
  let geocodingMessage = "Location saved";
  if (process.env.GOOGLE_MAPS_API_KEY) {
    const resolution = await resolveServiceLocationAddress({
      supabase,
      businessId: business.id,
      serviceLocationId: saveResult.data.id,
      provider: new GoogleGeocodingProvider(),
      providerPlaceId: payload.providerPlaceId,
    });
    if (!resolution.ok) geocodingMessage = "Location saved; address needs verification";
  }
  revalidatePath(`/app/${slug}/customers/${customerId}`);
  redirect(`/app/${slug}/customers/${customerId}?success=${encodeURIComponent(geocodingMessage)}`);
}

export async function retryServiceLocationGeocoding(
  slug: string,
  customerId: string,
  locationId: string,
) {
  const { supabase, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/customers/${customerId}?error=Permission+denied`);
  const result = await resolveServiceLocationAddress({
    supabase,
    businessId: business.id,
    serviceLocationId: locationId,
    provider: new GoogleGeocodingProvider(),
    force: true,
  });
  revalidatePath(`/app/${slug}/customers/${customerId}`);
  redirect(
    `/app/${slug}/customers/${customerId}?${result.ok ? "success" : "error"}=${encodeURIComponent(result.message)}`,
  );
}

export async function overrideServiceLocationCoordinates(
  slug: string,
  customerId: string,
  locationId: string,
  formData: FormData,
) {
  const { supabase, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/customers/${customerId}?error=Permission+denied`);
  const result = await setManualServiceLocationCoordinates({
    supabase,
    businessId: business.id,
    serviceLocationId: locationId,
    latitude: Number(text(formData, "latitude")),
    longitude: Number(text(formData, "longitude")),
  });
  revalidatePath(`/app/${slug}/customers/${customerId}`);
  redirect(
    `/app/${slug}/customers/${customerId}?${result.ok ? "success" : "error"}=${encodeURIComponent(result.message)}`,
  );
}

export async function clearServiceLocationCoordinateOverride(
  slug: string,
  customerId: string,
  locationId: string,
) {
  const { supabase, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/customers/${customerId}?error=Permission+denied`);
  const result = await clearManualServiceLocationCoordinates({
    supabase,
    businessId: business.id,
    serviceLocationId: locationId,
  });
  revalidatePath(`/app/${slug}/customers/${customerId}`);
  redirect(
    `/app/${slug}/customers/${customerId}?${result.ok ? "success" : "error"}=${encodeURIComponent(result.message)}`,
  );
}

export async function archiveServiceLocation(slug: string, customerId: string, locationId: string) {
  const { supabase, user, business, role } = await requireWorkspaceCapability(slug,"customer_management");
  if (!canManageCustomers(role)) redirect(`/app/${slug}/customers/${customerId}?error=Permission+denied`);
  await supabase.from("service_locations").update({ is_deleted: true, is_active: false, is_primary: false, updated_by: user.id }).eq("id", locationId).eq("customer_id", customerId).eq("business_id", business.id);
  revalidatePath(`/app/${slug}/customers/${customerId}`);
  redirect(`/app/${slug}/customers/${customerId}?success=Location+archived`);
}
