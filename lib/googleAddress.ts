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

type AddressComponent = { long_name: string; short_name: string; types: string[] };

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
    const components = (payload.result.address_components ?? []) as AddressComponent[];
    const part = (type: string, short = false) => {
      const component = components.find((item) => item.types.includes(type));
      return component ? (short ? component.short_name : component.long_name) : "";
    };
    const streetAddress = [part("street_number"), part("route")].filter(Boolean).join(" ");
    return {
      formattedAddress: payload.result.formatted_address,
      streetAddress,
      unit: part("subpremise"),
      city: part("locality") || part("postal_town") || part("administrative_area_level_2"),
      state: part("administrative_area_level_1", true),
      postalCode: part("postal_code"),
      country: part("country", true) || "US",
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
