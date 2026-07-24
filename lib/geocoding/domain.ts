import { createHash } from "node:crypto";

export type StructuredAddress = {
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postalCode?: string | null;
  countryCode: string;
};

export type GeocodingStatus = "verified" | "ambiguous" | "failed";
export type GeocodingConfidence = "exact" | "high" | "medium" | "low" | "unknown";
export type CoordinateSource = "provider" | "manual" | "import" | "legacy" | "unknown";

export type ResolveAddressInput = {
  address: StructuredAddress;
  providerPlaceId?: string | null;
};

export type NormalizedAddress = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
};

export type ResolveAddressResult = {
  status: GeocodingStatus;
  provider: string;
  providerPlaceId: string | null;
  formattedAddress: string | null;
  normalizedAddress: NormalizedAddress | null;
  coordinates: { latitude: number; longitude: number } | null;
  confidence: GeocodingConfidence;
  partialMatch: boolean;
  warningCodes: string[];
  errorCode: string | null;
};

export interface GeocodingProvider {
  readonly name: string;
  resolveAddress(input: ResolveAddressInput): Promise<ResolveAddressResult>;
}

function canonicalPart(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

export function normalizeCountryCode(value: string): string {
  const normalized = canonicalPart(value).toUpperCase();
  if (normalized === "USA" || normalized === "UNITED STATES" || normalized === "UNITED STATES OF AMERICA") {
    return "US";
  }
  return normalized;
}

export function canonicalAddress(address: StructuredAddress): string {
  return [
    canonicalPart(address.line1),
    canonicalPart(address.line2),
    canonicalPart(address.city),
    canonicalPart(address.region),
    canonicalPart(address.postalCode),
    normalizeCountryCode(address.countryCode),
  ].join("\u001f");
}

export function addressFingerprint(address: StructuredAddress): string {
  return createHash("sha256").update(canonicalAddress(address), "utf8").digest("hex");
}

export function validCoordinates(
  coordinates: { latitude: number; longitude: number } | null | undefined,
): coordinates is { latitude: number; longitude: number } {
  return Boolean(
    coordinates &&
      Number.isFinite(coordinates.latitude) &&
      coordinates.latitude >= -90 &&
      coordinates.latitude <= 90 &&
      Number.isFinite(coordinates.longitude) &&
      coordinates.longitude >= -180 &&
      coordinates.longitude <= 180 &&
      !(coordinates.latitude === 0 && coordinates.longitude === 0),
  );
}

export function validateResolution(result: ResolveAddressResult): ResolveAddressResult {
  if (!result.provider.trim()) throw new Error("Geocoding provider is required.");
  if (result.status === "verified") {
    if (!validCoordinates(result.coordinates)) {
      throw new Error("A verified geocoding result requires valid coordinates.");
    }
    if (!result.formattedAddress?.trim() || !result.normalizedAddress?.line1?.trim()) {
      throw new Error("A verified geocoding result requires a normalized address.");
    }
  }
  if (result.status === "ambiguous" && result.coordinates) {
    return { ...result, coordinates: null };
  }
  return result;
}

export function safeGeocodingError(code: string | null | undefined): string {
  switch (code) {
    case "missing_api_key":
      return "Address verification is not configured.";
    case "rate_limited":
    case "quota_exceeded":
    case "timeout":
    case "network_error":
    case "provider_unavailable":
      return "Address verification is temporarily unavailable.";
    case "ambiguous":
      return "Multiple possible locations were found. Review the address before routing.";
    default:
      return "We could not verify this address.";
  }
}

