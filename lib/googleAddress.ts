import { GoogleGeocodingProvider } from "@/lib/geocoding/googleProvider";
import type { ResolveAddressResult, StructuredAddress } from "@/lib/geocoding/domain";

export type VerifiedGoogleAddress = {
  formattedAddress: string;
  streetAddress: string;
  unit: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
};

export async function verifyGooglePlace(placeId: string): Promise<VerifiedGoogleAddress | null> {
  if (!placeId) return null;
  const result = await resolveGoogleAddress(
    {
      line1: "Selected Google place",
      city: "Selected Google place",
      region: "Selected Google place",
      countryCode: "US",
    },
    placeId,
  );
  if (result.status !== "verified" || !result.normalizedAddress || !result.formattedAddress) return null;
  return {
    formattedAddress: result.formattedAddress,
    streetAddress: result.normalizedAddress.line1 ?? "",
    unit: result.normalizedAddress.line2 ?? "",
    city: result.normalizedAddress.city ?? "",
    state: result.normalizedAddress.region ?? "",
    postalCode: result.normalizedAddress.postalCode ?? "",
    country: result.normalizedAddress.countryCode ?? "US",
    latitude: result.coordinates?.latitude ?? null,
    longitude: result.coordinates?.longitude ?? null,
  };
}

export async function resolveGoogleAddress(
  address: StructuredAddress,
  placeId?: string | null,
): Promise<ResolveAddressResult> {
  return new GoogleGeocodingProvider().resolveAddress({ address, providerPlaceId: placeId });
}
