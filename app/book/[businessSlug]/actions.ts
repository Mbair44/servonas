"use server";

import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const fail = (slug: string, message: string): never =>
  redirect(`/book/${slug}?error=${encodeURIComponent(message)}`);

async function verifyGoogleAddress(placeId: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "formatted_address,address_components,geometry,types");
  url.searchParams.set("key", key);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json();
  if (payload.status !== "OK" || !payload.result?.formatted_address) return null;
  return payload.result.formatted_address as string;
}

export async function submitPublicBooking(publicSlug: string, formData: FormData) {
  const maybeSupabase = getSupabaseAdmin();

  if (!maybeSupabase) {
    fail(publicSlug, "Booking is temporarily unavailable");
  }

  // The runtime guard above guarantees an admin client. This explicit
  // assignment also gives TypeScript a non-null client for the rest of
  // the server action.
  const supabase = maybeSupabase as NonNullable<typeof maybeSupabase>;

  if (text(formData, "companyWebsite")) {
    redirect(`/book/${publicSlug}?success=Thanks`);
  }

  const { data: settings } = await supabase
    .from("booking_settings")
    .select("*,businesses(id,name,slug)")
    .ilike("public_slug", publicSlug)
    .eq("enabled", true)
    .maybeSingle();
  if (!settings) fail(publicSlug, "This booking page is not available");

  const serviceId = text(formData, "serviceId");
  const startRaw = text(formData, "startsAt");
  const first = text(formData, "firstName");
  const last = text(formData, "lastName");
  const email = text(formData, "email").toLowerCase();
  const phone = text(formData, "phone");
  if (!serviceId || !startRaw || !first || (!email && !phone)) {
    fail(publicSlug, "Complete the required fields");
  }

  const { data: service } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .eq("business_id", settings.business_id)
    .eq("active", true)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!service) fail(publicSlug, "That service is no longer available");

  const [datePart, timePart] = startRaw.split("T");
  if (!datePart || !/^\d{2}:(00|30)$/.test(timePart ?? "")) {
    fail(publicSlug, "Choose an appointment time in a 30-minute increment");
  }

  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) fail(publicSlug, "Choose a valid appointment time");
  const serviceEnd = new Date(start.getTime() + service.duration_minutes * 60000);
  const conflictEnd = new Date(
    start.getTime() + (service.duration_minutes + settings.buffer_minutes) * 60000,
  );
  const now = Date.now();
  if (
    start.getTime() < now + settings.minimum_notice_hours * 3600000 ||
    start.getTime() > now + settings.maximum_days_ahead * 86400000
  ) {
    fail(publicSlug, "That time is outside the booking window");
  }

  const weekday = new Date(`${datePart}T12:00:00Z`).getUTCDay();
  const serviceEndTime = `${String(serviceEnd.getHours()).padStart(2, "0")}:${String(
    serviceEnd.getMinutes(),
  ).padStart(2, "0")}`;
  const { data: opening } = await supabase
    .from("booking_availability")
    .select("start_time,end_time")
    .eq("business_id", settings.business_id)
    .eq("weekday", weekday)
    .eq("active", true)
    .lte("start_time", timePart)
    .gte("end_time", serviceEndTime)
    .maybeSingle();
  if (!opening) fail(publicSlug, "That time is outside the business’s available hours");

  let verifiedAddress: string | null = null;
  if (settings.collect_address) {
    const enteredAddress = text(formData, "address");
    const placeId = text(formData, "addressPlaceId");
    if (!enteredAddress) fail(publicSlug, "Enter a service address");
    if (process.env.GOOGLE_MAPS_API_KEY) {
      if (!placeId) fail(publicSlug, "Select a verified address from Google’s suggestions");
      verifiedAddress = await verifyGoogleAddress(placeId);
      if (!verifiedAddress) fail(publicSlug, "We could not verify that address. Please choose it again");
    } else {
      verifiedAddress = enteredAddress;
    }
  }

  const dayStart = new Date(`${datePart}T00:00:00`);
  const dayEnd = new Date(`${datePart}T23:59:59`);
  const [{ data: conflicts }, { data: blackouts }, { count: dayCount }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id")
      .eq("business_id", settings.business_id)
      .eq("is_deleted", false)
      .not("status", "eq", "canceled")
      .lt("starts_at", conflictEnd.toISOString())
      .gt("ends_at", start.toISOString())
      .limit(1),
    supabase
      .from("booking_blackouts")
      .select("id")
      .eq("business_id", settings.business_id)
      .lt("starts_at", conflictEnd.toISOString())
      .gt("ends_at", start.toISOString())
      .limit(1),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("business_id", settings.business_id)
      .eq("is_deleted", false)
      .not("status", "eq", "canceled")
      .gte("starts_at", dayStart.toISOString())
      .lte("starts_at", dayEnd.toISOString()),
  ]);
  if (
    conflicts?.length ||
    blackouts?.length ||
    (settings.daily_appointment_limit && Number(dayCount) >= settings.daily_appointment_limit)
  ) {
    fail(publicSlug, "That time is not available. Please choose another");
  }

  let customerId: string | undefined;
  if (email) {
    const { data: existing } = await supabase
      .from("customers")
      .select("id")
      .eq("business_id", settings.business_id)
      .ilike("email", email)
      .eq("is_deleted", false)
      .maybeSingle();
    customerId = existing?.id;
  }

  if (!customerId) {
    const { data: customer, error } = await supabase
      .from("customers")
      .insert({
        business_id: settings.business_id,
        first_name: first,
        last_name: last,
        email: email || null,
        phone: phone || null,
        notes: null,
      })
      .select("id")
      .single();
    if (error || !customer) {
      console.error("Public customer creation failed", error);
      fail(publicSlug, "We couldn’t save your contact information");
    }
    customerId = customer.id;
  } else {
    await supabase
      .from("customers")
      .update({
        first_name: first,
        last_name: last,
        phone: phone || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", customerId);
  }

  const status = settings.auto_confirm ? "confirmed" : "pending";
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      business_id: settings.business_id,
      customer_id: customerId,
      service_id: service.id,
      title: service.name,
      status,
      starts_at: start.toISOString(),
      ends_at: serviceEnd.toISOString(),
      service_address: verifiedAddress,
      description:
        [
          text(formData, "details"),
          ...(settings.intake_questions ?? []).map((question: string, index: number) => {
            const answer = text(formData, `question_${index}`);
            return answer ? `${question}: ${answer}` : "";
          }),
        ]
          .filter(Boolean)
          .join("\n\n") || null,
      subtotal: service.price_amount || 0,
      tax_amount: 0,
      booking_source: "website",
    })
    .select("id")
    .single();
  if (jobError || !job) {
    console.error("Public job creation failed", jobError);
    fail(publicSlug, "We couldn’t complete your booking");
  }

  const requestKey = text(formData, "requestKey") || null;
  const { data: submission } = await supabase
    .from("public_booking_submissions")
    .insert({
      business_id: settings.business_id,
      service_id: service.id,
      job_id: job.id,
      customer_id: customerId,
      request_key: requestKey,
      status: "accepted",
    })
    .select("id")
    .single();
  if (submission) {
    await supabase.from("jobs").update({ public_booking_id: submission.id }).eq("id", job.id);
  }

  redirect(`/book/${publicSlug}/success`);
}
