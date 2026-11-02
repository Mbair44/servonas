import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveGoogleAddress, type VerifiedGoogleAddress } from "@/lib/googleAddress";
import { deliveryQuoteMessage, quoteBusinessDelivery } from "@/lib/deliveryQuote";

export type ManagedDeliveryAddress = { line1: string; line2?: string; city: string; state: string; postalCode: string; country?: string };

export async function resolveManagedDeliveryAddress(db: SupabaseClient, businessId: string, input: ManagedDeliveryAddress) {
  const address = { line1: input.line1.trim(), line2: input.line2?.trim() || null, city: input.city.trim(), region: input.state.trim(), postalCode: input.postalCode.trim(), countryCode: (input.country || "US").trim().toUpperCase() };
  if (!address.line1 || !address.city || !address.region || !address.postalCode) throw new Error("Enter the street address, city, state, and ZIP code.");
  const resolved = await resolveGoogleAddress(address);
  if (resolved.status !== "verified" || !resolved.normalizedAddress?.line1 || !resolved.normalizedAddress.city || !resolved.normalizedAddress.region || !resolved.normalizedAddress.postalCode || !resolved.coordinates) throw new Error("We couldn't verify that address. Check the details and try again.");
  const destination: VerifiedGoogleAddress = { formattedAddress: resolved.formattedAddress || address.line1, streetAddress: resolved.normalizedAddress.line1, unit: resolved.normalizedAddress.line2 || "", city: resolved.normalizedAddress.city, state: resolved.normalizedAddress.region, postalCode: resolved.normalizedAddress.postalCode, country: resolved.normalizedAddress.countryCode || "US", latitude: resolved.coordinates.latitude, longitude: resolved.coordinates.longitude };
  let quote;
  try { quote = await quoteBusinessDelivery(db, businessId, destination); }
  catch (error) { throw new Error(deliveryQuoteMessage(error)); }
  if (quote && !quote.eligible) throw new Error(quote.requiresQuote ? "This address is outside the normal service area. Please contact the business for a delivery quote." : "This address is outside the online delivery area.");
  return { destination, quote };
}
