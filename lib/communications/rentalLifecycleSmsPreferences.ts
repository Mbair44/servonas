export type RentalLifecycleSmsType = "reminder" | "technician_en_route" | "review_request" | "payment_receipt";

export type RentalLifecycleSmsPreferences = {
  suppress_rental_reminder_sms?: boolean | null;
  suppress_technician_en_route_sms?: boolean | null;
} | null | undefined;

/** Whether a job-specific exception suppresses this lifecycle text. */
export function isRentalLifecycleSmsSuppressed(type: RentalLifecycleSmsType, preferences: RentalLifecycleSmsPreferences) {
  return (type === "reminder" && preferences?.suppress_rental_reminder_sms === true)
    || (type === "technician_en_route" && preferences?.suppress_technician_en_route_sms === true);
}
