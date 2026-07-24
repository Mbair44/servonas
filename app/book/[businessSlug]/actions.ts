"use server";

import { redirect } from "next/navigation";
import type { BookingActionState } from "@/components/PublicBookingForm";
import { zonedDateTimeToUtc } from "@/lib/bookingTime";
import { getAvailability } from "@/lib/publicAvailability";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { EmailService } from "@/lib/communications/emailService";
import { SMSService } from "@/lib/communications/smsService";
import { bookingPhotoExtension, validateBookingPhoto } from "@/lib/bookingPhoto";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return value;
};
async function verifyGoogleAddress(placeId: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "formatted_address");
  url.searchParams.set("key", key);
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      console.error("Google address verification request failed", { status: response.status });
      return null;
    }
    const payload = await response.json();
    if (payload.status !== "OK") {
      console.error("Google address verification was rejected", { status: payload.status });
      return null;
    }
    return (payload.result?.formatted_address as string | undefined) ?? null;
  } catch (error) {
    console.error("Google address verification was unavailable", {
      cause: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

export async function submitPublicBooking(
  publicSlug: string,
  _previousState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const values = Object.fromEntries(
    [...formData.entries()]
      .filter(([key, value]) => typeof value === "string" && key !== "companyWebsite")
      .map(([key, value]) => [key, String(value)]),
  );
  const fail = (message: string, fieldErrors: Record<string, string> = {}): BookingActionState => ({
    error: message,
    fieldErrors,
    values,
  });
  const supabase = getSupabaseAdmin();
  if (!supabase) return fail("Booking is temporarily unavailable.");
  if (text(formData, "companyWebsite")) return {};

  const { data: settings } = await supabase
    .from("booking_settings")
    .select("*,businesses(id,name)")
    .ilike("public_slug", publicSlug)
    .eq("enabled", true)
    .maybeSingle();
  if (!settings) return fail("This booking page is not available.");

  const serviceId = text(formData, "serviceId");
  const startRaw = text(formData, "startsAt");
  const first = text(formData, "firstName");
  const last = text(formData, "lastName");
  const email = text(formData, "email").toLowerCase();
  const phoneInput = text(formData, "phone");
  const phone = phoneInput ? normalizePhone(phoneInput) : "";
  const requestKey = text(formData, "requestKey");
  const photoEntry = formData.get("bookingPhoto");
  const bookingPhoto = photoEntry instanceof File && photoEntry.size > 0 ? photoEntry : null;
  const fieldErrors: Record<string, string> = {};
  if (!serviceId) fieldErrors.serviceId = "Choose a service.";
  if (!startRaw) fieldErrors.startsAt = "Choose an available date and time.";
  if (!first) fieldErrors.firstName = "Enter your first name.";
  if (!email && !phone) {
    fieldErrors.email = "Enter an email address or phone number.";
    fieldErrors.phone = "Enter a phone number or email address.";
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (phone && phone.replace(/\D/g, "").length < 10) fieldErrors.phone = "Enter a valid phone number.";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) {
    fieldErrors.form = "Refresh the page before submitting this booking.";
  }
  const photoError = validateBookingPhoto(bookingPhoto);
  if (photoError) fieldErrors.bookingPhoto = photoError;
  if (Object.keys(fieldErrors).length) return fail("Please correct the highlighted information.", fieldErrors);

  const { data: priorSubmission, error: priorSubmissionError } = await supabase
    .from("public_booking_submissions")
    .select("id,job_id")
    .eq("business_id", settings.business_id)
    .eq("request_key", requestKey)
    .maybeSingle();
  if (priorSubmissionError) {
    console.error("Public booking idempotency lookup failed", {
      code: priorSubmissionError.code,
      businessId: settings.business_id,
    });
    return fail("We couldn’t verify this booking request. Please try again.");
  }
  if (priorSubmission?.job_id) {
    redirect(`/book/${publicSlug}/success?confirmation=${priorSubmission.id}`);
  }
  if (priorSubmission) {
    return fail("This booking request is already being processed. Please wait a moment before trying again.");
  }

  const { data: service } = await supabase
    .from("services")
    .select("id,name,duration_minutes,price_amount")
    .eq("id", serviceId)
    .eq("business_id", settings.business_id)
    .eq("active", true)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!service) return fail("That service is no longer available.", { serviceId: "Choose another service." });

  const [datePart, timePart] = startRaw.split("T");
  if (!datePart || !/^\d{2}:\d{2}$/.test(timePart ?? "")) {
    return fail("Choose a valid appointment time.", { startsAt: "Choose an available date and time." });
  }
  const slots = await getAvailability(supabase, settings, service, datePart, datePart);
  if (!slots[datePart]?.includes(timePart)) {
    return fail("That time is no longer available. Your information has been kept—please choose another time.", {
      startsAt: "Time unavailable.",
    });
  }

  let verifiedAddress: string | null = null;
  if (settings.collect_address) {
    const enteredAddress = text(formData, "address");
    const placeId = text(formData, "addressPlaceId");
    if (!enteredAddress) return fail("Enter the service address.", { address: "Address is required." });
    if (process.env.GOOGLE_MAPS_API_KEY) {
      if (!placeId) return fail("Select an address from Google’s suggestions.", { address: "Choose a verified address." });
      verifiedAddress = await verifyGoogleAddress(placeId);
      if (!verifiedAddress) return fail("We could not verify that address.", { address: "Choose the address again." });
    } else verifiedAddress = enteredAddress;
  }

  const { data: submission, error: reservationError } = await supabase
    .from("public_booking_submissions")
    .insert({
      business_id: settings.business_id,
      service_id: service.id,
      request_key: requestKey,
      status: "accepted",
    })
    .select("id")
    .single();
  if (reservationError || !submission) {
    // A concurrent retry can lose the insert race against the unique request-key
    // index. Re-read the winner instead of creating another customer or job.
    if (reservationError?.code === "23505") {
      const { data: winner, error: winnerError } = await supabase
        .from("public_booking_submissions")
        .select("id,job_id")
        .eq("business_id", settings.business_id)
        .eq("request_key", requestKey)
        .maybeSingle();
      if (winnerError) {
        console.error("Public booking idempotency race lookup failed", {
          code: winnerError.code,
          businessId: settings.business_id,
        });
      } else if (winner?.job_id) {
        redirect(`/book/${publicSlug}/success?confirmation=${winner.id}`);
      } else if (winner) {
        return fail("This booking request is already being processed. Please wait a moment before trying again.");
      }
    }
    console.error("Public booking request reservation failed", {
      code: reservationError?.code,
      businessId: settings.business_id,
    });
    return fail("We couldn’t start your booking. Please try again.");
  }
  const releaseReservation = async () => {
    const { error: releaseError } = await supabase
      .from("public_booking_submissions")
      .delete()
      .eq("id", submission.id)
      .is("job_id", null);
    if (releaseError) {
      console.error("Public booking reservation cleanup failed", {
        code: releaseError.code,
        submissionId: submission.id,
        businessId: settings.business_id,
      });
    }
  };

  let customerId: string | undefined;
  if (email) {
    const { data: existing, error: customerLookupError } = await supabase.from("customers").select("id").eq("business_id", settings.business_id).ilike("email", email).eq("is_deleted", false).maybeSingle();
    if (customerLookupError) {
      console.error("Public customer lookup failed", { code: customerLookupError.code, businessId: settings.business_id });
      await releaseReservation();
      return fail("We couldn’t verify your contact information. Please try again.");
    }
    customerId = existing?.id;
  } else if (phone) {
    const candidates = phone === phoneInput ? [phone] : [phone, phoneInput];
    const { data: existing, error: customerLookupError } = await supabase
      .from("customers")
      .select("id")
      .eq("business_id", settings.business_id)
      .in("phone", candidates)
      .eq("is_deleted", false)
      .limit(1)
      .maybeSingle();
    if (customerLookupError) {
      console.error("Public customer phone lookup failed", { code: customerLookupError.code, businessId: settings.business_id });
      await releaseReservation();
      return fail("We couldn’t verify your contact information. Please try again.");
    }
    customerId = existing?.id;
  }
  if (!customerId) {
    const { data: customer, error: customerError } = await supabase.from("customers").insert({
      business_id: settings.business_id, first_name: first, last_name: last, email: email || null, phone: phone || null,
    }).select("id").single();
    if (customerError || !customer) {
      console.error("Public customer creation failed", { code: customerError?.code, businessId: settings.business_id });
      await releaseReservation();
      return fail("We couldn’t save your contact information. Please try again.");
    }
    customerId = customer.id;
  } else {
    const { error: customerUpdateError } = await supabase.from("customers").update({
      first_name: first,
      last_name: last,
      email: email || null,
      phone: phone || null,
      updated_at: new Date().toISOString(),
    }).eq("id", customerId).eq("business_id", settings.business_id);
    if (customerUpdateError) {
      console.error("Public customer update failed", { code: customerUpdateError.code, businessId: settings.business_id });
      await releaseReservation();
      return fail("We couldn’t update your contact information. Please try again.");
    }
  }

  const start = zonedDateTimeToUtc(datePart, timePart, settings.timezone);
  const serviceEnd = new Date(start.getTime() + service.duration_minutes * 60_000);
  const status = settings.auto_confirm ? "confirmed" : "pending";
  const { data: job, error: jobError } = await supabase.from("jobs").insert({
    business_id: settings.business_id,
    customer_id: customerId,
    service_id: service.id,
    title: service.name,
    status,
    starts_at: start.toISOString(),
    ends_at: serviceEnd.toISOString(),
    service_address: verifiedAddress,
    description: [text(formData, "details"), ...(settings.intake_questions ?? []).map((question: string, index: number) => {
      const answer = text(formData, `question_${index}`);
      return answer ? `${question}: ${answer}` : "";
    })].filter(Boolean).join("\n\n") || null,
    subtotal: service.price_amount || 0,
    tax_amount: 0,
    booking_source: "website",
  }).select("id,job_number").single();
  if (jobError || !job) {
    console.error("Public job creation failed", { code: jobError?.code, businessId: settings.business_id });
    await releaseReservation();
    return fail("We couldn’t complete your booking. Please try again.");
  }

  const { data: completedSubmission, error: submissionError } = await supabase
    .from("public_booking_submissions")
    .update({ job_id: job.id, customer_id: customerId })
    .eq("id", submission.id)
    .eq("business_id", settings.business_id)
    .is("job_id", null)
    .select("id")
    .single();
  if (submissionError || !completedSubmission) {
    console.error("Public submission completion failed", {
      code: submissionError?.code,
      submissionId: submission.id,
      jobId: job.id,
      businessId: settings.business_id,
    });
    return fail("Your appointment was created, but confirmation could not be loaded. Please contact the business.");
  }
  if (bookingPhoto) {
    const extension = bookingPhotoExtension(bookingPhoto.type);
    const storagePath = `${settings.business_id}/${job.id}/customer-${submission.id}.${extension}`;
    const { error: photoUploadError } = await supabase.storage.from("job-photos").upload(storagePath, bookingPhoto, {
      contentType: bookingPhoto.type,
      upsert: false,
    });
    if (photoUploadError) {
      console.error("Public booking photo upload failed", {
        code: photoUploadError.name,
        submissionId: submission.id,
        jobId: job.id,
        businessId: settings.business_id,
      });
    } else {
      const { error: photoRecordError } = await supabase.from("job_photos").insert({
        business_id: settings.business_id,
        job_id: job.id,
        storage_path: storagePath,
        caption: "Customer booking photo",
        uploaded_by: null,
      });
      if (photoRecordError) {
        await supabase.storage.from("job-photos").remove([storagePath]);
        console.error("Public booking photo metadata failed", {
          code: photoRecordError.code,
          submissionId: submission.id,
          jobId: job.id,
          businessId: settings.business_id,
        });
      }
    }
  }
  const [linkResult, analyticsResult] = await Promise.all([
    supabase.from("jobs").update({ public_booking_id: submission.id }).eq("id", job.id),
    supabase.from("public_booking_events").insert({
      business_id: settings.business_id, service_id: service.id, submission_id: submission.id, event_name: "booking_completed", metadata: {},
    }),
    status === "confirmed" ? EmailService.bookingConfirmation(job.id) : EmailService.bookingPending(job.id),
    SMSService.bookingConfirmation(job.id),
    SMSService.bookingManagerNotification(job.id, settings.booking_manager_phone),
  ]);
  if (linkResult.error) console.error("Public job confirmation link failed", linkResult.error);
  if (analyticsResult.error) console.error("Public booking completion analytics failed", analyticsResult.error);

  const [verifiedSubmissionResult, verifiedJobResult] = await Promise.all([
    supabase
      .from("public_booking_submissions")
      .select("id,job_id")
      .eq("id", submission.id)
      .eq("business_id", settings.business_id)
      .eq("job_id", job.id)
      .maybeSingle(),
    supabase
      .from("jobs")
      .select("id,business_id")
      .eq("id", job.id)
      .eq("business_id", settings.business_id)
      .eq("is_deleted", false)
      .maybeSingle(),
  ]);
  if (
    verifiedSubmissionResult.error ||
    verifiedJobResult.error ||
    !verifiedSubmissionResult.data ||
    !verifiedJobResult.data
  ) {
    console.error("Public booking verification failed before redirect", {
      submissionError: verifiedSubmissionResult.error,
      jobError: verifiedJobResult.error,
      submissionId: submission.id,
      jobId: job.id,
      businessId: settings.business_id,
    });
    return fail("Your appointment was created, but confirmation could not be verified. Please contact the business.");
  }
  redirect(`/book/${publicSlug}/success?confirmation=${submission.id}`);
}
