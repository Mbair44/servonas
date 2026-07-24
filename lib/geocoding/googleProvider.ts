import {
  validateResolution,
  validCoordinates,
  type GeocodingConfidence,
  type GeocodingProvider,
  type NormalizedAddress,
  type ResolveAddressInput,
  type ResolveAddressResult,
} from "./domain.ts";
import { parseGoogleAddressComponents, type GoogleAddressComponent } from "../googleAddressComponents.ts";

type GoogleResult = {
  place_id?: string;
  formatted_address?: string;
  partial_match?: boolean;
  address_components?: GoogleAddressComponent[];
  geometry?: {
    location?: { lat?: number; lng?: number };
    location_type?: string;
  };
};

type GooglePayload = {
  status?: string;
  error_message?: string;
  result?: GoogleResult;
  results?: GoogleResult[];
};

export type GoogleGeocodingProviderOptions = {
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

function failed(code: string): ResolveAddressResult {
  return {
    status: "failed",
    provider: "google",
    providerPlaceId: null,
    formattedAddress: null,
    normalizedAddress: null,
    coordinates: null,
    confidence: "unknown",
    partialMatch: false,
    warningCodes: [],
    errorCode: code,
  };
}

function normalized(result: GoogleResult): NormalizedAddress {
  const address = parseGoogleAddressComponents(result.address_components ?? [], result.formatted_address ?? "");
  return {
    line1: address.streetAddress || null,
    line2: address.unit || null,
    city: address.city || null,
    region: address.state || null,
    postalCode: address.postalCode || null,
    countryCode: address.country || null,
  };
}

function confidenceFor(result: GoogleResult, usedPlaceId: boolean): GeocodingConfidence {
  if (result.partial_match) return "low";
  if (result.geometry?.location_type === "ROOFTOP") return "exact";
  if (usedPlaceId) return "high";
  if (result.geometry?.location_type === "RANGE_INTERPOLATED") return "medium";
  return "medium";
}

function classifyProviderStatus(status: string | undefined): string {
  if (status === "OVER_QUERY_LIMIT") return "quota_exceeded";
  if (status === "REQUEST_DENIED") return "request_denied";
  if (status === "INVALID_REQUEST") return "invalid_request";
  if (status === "ZERO_RESULTS" || status === "NOT_FOUND") return "no_result";
  return "provider_unavailable";
}

export class GoogleGeocodingProvider implements GeocodingProvider {
  readonly name = "google";
  private readonly apiKey: string | undefined;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: GoogleGeocodingProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.GOOGLE_MAPS_API_KEY;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 8_000;
  }

  async resolveAddress(input: ResolveAddressInput): Promise<ResolveAddressResult> {
    if (!this.apiKey) return failed("missing_api_key");
    const usedPlaceId = Boolean(input.providerPlaceId);
    const url = new URL(
      usedPlaceId
        ? "https://maps.googleapis.com/maps/api/place/details/json"
        : "https://maps.googleapis.com/maps/api/geocode/json",
    );
    if (usedPlaceId) {
      url.searchParams.set("place_id", input.providerPlaceId!);
      url.searchParams.set("fields", "place_id,formatted_address,address_components,geometry");
    } else {
      url.searchParams.set(
        "address",
        [
          input.address.line1,
          input.address.line2,
          input.address.city,
          input.address.region,
          input.address.postalCode,
          input.address.countryCode,
        ]
          .filter(Boolean)
          .join(", "),
      );
    }
    url.searchParams.set("key", this.apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) return failed(response.status === 429 ? "rate_limited" : "provider_unavailable");
      const payload = (await response.json()) as GooglePayload;
      if (payload.status !== "OK") return failed(classifyProviderStatus(payload.status));

      const candidates = usedPlaceId ? (payload.result ? [payload.result] : []) : (payload.results ?? []);
      if (candidates.length === 0) return failed("no_result");
      if (!usedPlaceId && candidates.length > 1) {
        return {
          ...failed("ambiguous"),
          status: "ambiguous",
          warningCodes: ["multiple_candidates"],
        };
      }

      const result = candidates[0];
      const coordinates = {
        latitude: result.geometry?.location?.lat ?? Number.NaN,
        longitude: result.geometry?.location?.lng ?? Number.NaN,
      };
      if (!validCoordinates(coordinates)) return failed("invalid_coordinates");
      const parsed = normalized(result);
      if (!parsed.line1 || !parsed.city || !parsed.region || !parsed.countryCode) {
        return {
          ...failed("ambiguous"),
          status: "ambiguous",
          warningCodes: ["incomplete_address"],
        };
      }
      if (result.partial_match) {
        return {
          ...failed("ambiguous"),
          status: "ambiguous",
          providerPlaceId: result.place_id ?? input.providerPlaceId ?? null,
          formattedAddress: result.formatted_address ?? null,
          normalizedAddress: parsed,
          confidence: "low",
          partialMatch: true,
          warningCodes: ["partial_match"],
        };
      }
      return validateResolution({
        status: "verified",
        provider: "google",
        providerPlaceId: result.place_id ?? input.providerPlaceId ?? null,
        formattedAddress: result.formatted_address ?? null,
        normalizedAddress: parsed,
        coordinates,
        confidence: confidenceFor(result, usedPlaceId),
        partialMatch: false,
        warningCodes: [],
        errorCode: null,
      });
    } catch (error) {
      return failed(error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error");
    } finally {
      clearTimeout(timer);
    }
  }
}
