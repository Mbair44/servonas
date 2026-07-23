export type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

export type StructuredGoogleAddress = {
  streetAddress: string;
  unit: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export function parseGoogleAddressComponents(
  components: GoogleAddressComponent[] = [],
  formattedAddress = "",
): StructuredGoogleAddress {
  const part = (type: string, short = false) => {
    const component = components.find((item) => item.types.includes(type));
    return component ? (short ? component.short_name : component.long_name) : "";
  };
  const postalCode = [part("postal_code"), part("postal_code_suffix")].filter(Boolean).join("-");
  return {
    streetAddress: [part("street_number"), part("route")].filter(Boolean).join(" ")
      || formattedAddress.split(",")[0]?.trim()
      || "",
    unit: part("subpremise"),
    city: part("locality")
      || part("postal_town")
      || part("sublocality_level_1")
      || part("administrative_area_level_2"),
    state: part("administrative_area_level_1", true),
    postalCode,
    country: part("country", true) || "US",
  };
}
