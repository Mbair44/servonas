import type {
  GeocodingProvider,
  ResolveAddressInput,
  ResolveAddressResult,
} from "./domain.ts";

export type StubGeocodingScenario =
  | "exact"
  | "normalized"
  | "ambiguous"
  | "no_result"
  | "provider_failure"
  | "invalid_coordinates"
  | "partial_match";

export class StubGeocodingProvider implements GeocodingProvider {
  readonly name = "stub";
  readonly calls: ResolveAddressInput[] = [];
  private readonly scenario: StubGeocodingScenario;

  constructor(scenario: StubGeocodingScenario = "exact") {
    this.scenario = scenario;
  }

  async resolveAddress(input: ResolveAddressInput): Promise<ResolveAddressResult> {
    this.calls.push(input);
    const base: ResolveAddressResult = {
      status: "verified",
      provider: "stub",
      providerPlaceId: input.providerPlaceId ?? "stub-place-123",
      formattedAddress: "123 Example Street, Testville, AZ 85001, US",
      normalizedAddress: {
        line1: "123 Example Street",
        line2: null,
        city: "Testville",
        region: "AZ",
        postalCode: "85001",
        countryCode: "US",
      },
      coordinates: { latitude: 33.45, longitude: -112.07 },
      confidence: "exact",
      partialMatch: false,
      warningCodes: [],
      errorCode: null,
    };
    if (this.scenario === "normalized") return { ...base, confidence: "high" };
    if (this.scenario === "ambiguous") {
      return { ...base, status: "ambiguous", coordinates: null, confidence: "low", errorCode: "ambiguous" };
    }
    if (this.scenario === "partial_match") {
      return {
        ...base,
        status: "ambiguous",
        coordinates: null,
        confidence: "low",
        partialMatch: true,
        warningCodes: ["partial_match"],
        errorCode: "ambiguous",
      };
    }
    if (this.scenario === "invalid_coordinates") {
      return { ...base, coordinates: { latitude: 999, longitude: -112.07 } };
    }
    if (this.scenario === "no_result") {
      return { ...base, status: "failed", coordinates: null, confidence: "unknown", errorCode: "no_result" };
    }
    if (this.scenario === "provider_failure") {
      return {
        ...base,
        status: "failed",
        coordinates: null,
        confidence: "unknown",
        errorCode: "provider_unavailable",
      };
    }
    return base;
  }
}
