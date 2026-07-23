import { parseGoogleAddressComponents, type GoogleAddressComponent } from "@/lib/googleAddressComponents";

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
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !placeId) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "formatted_address,address_components,geometry");
  url.searchParams.set("key", key);
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      console.error("Google location verification failed", { status: response.status });
      return null;
    }
    const payload = await response.json();
    if (payload.status !== "OK" || !payload.result?.formatted_address) {
      console.error("Google location verification rejected", { status: payload.status });
      return null;
    }
    const address = parseGoogleAddressComponents(
      (payload.result.address_components ?? []) as GoogleAddressComponent[],
      payload.result.formatted_address,
    );
    return {
      formattedAddress: payload.result.formatted_address,
      ...address,
      latitude: payload.result.geometry?.location?.lat ?? null,
      longitude: payload.result.geometry?.location?.lng ?? null,
    };
  } catch (error) {
    console.error("Google location verification unavailable", {
      cause: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}
