import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  addressFingerprint,
  normalizeCountryCode,
  validateResolution,
  validCoordinates,
  type StructuredAddress,
} from "../lib/geocoding/domain.ts";
import { GoogleGeocodingProvider } from "../lib/geocoding/googleProvider.ts";
import { resolveServiceLocationAddress } from "../lib/geocoding/service.ts";
import { StubGeocodingProvider } from "../lib/geocoding/stubProvider.ts";

const address: StructuredAddress = {
  line1: "3058 E Austin Drive",
  line2: null,
  city: "Gilbert",
  region: "AZ",
  postalCode: "85296",
  countryCode: "US",
};

test("address fingerprints ignore safe casing and whitespace differences", () => {
  const expected = addressFingerprint(address);
  assert.equal(
    addressFingerprint({
      ...address,
      line1: "  3058   e AUSTIN drive ",
      city: " GILBERT ",
      countryCode: "United States",
    }),
    expected,
  );
  assert.notEqual(addressFingerprint({ ...address, line1: "3059 E Austin Drive" }), expected);
  assert.notEqual(addressFingerprint({ ...address, city: "Mesa" }), expected);
  assert.notEqual(addressFingerprint({ ...address, postalCode: "85295" }), expected);
  assert.equal(normalizeCountryCode(" usa "), "US");
  assert.equal(addressFingerprint({ ...address, line2: null }), addressFingerprint({ ...address, line2: "" }));
});

test("coordinate validation rejects impossible and placeholder coordinates", () => {
  assert.equal(validCoordinates({ latitude: 33.45, longitude: -112.07 }), true);
  assert.equal(validCoordinates({ latitude: 0, longitude: -112.07 }), true);
  assert.equal(validCoordinates({ latitude: 0, longitude: 0 }), false);
  assert.equal(validCoordinates({ latitude: Number.NaN, longitude: -112.07 }), false);
  assert.equal(validCoordinates({ latitude: 91, longitude: -112.07 }), false);
});

test("verified provider results require coordinates and normalized address", () => {
  assert.throws(
    () =>
      validateResolution({
        status: "verified",
        provider: "stub",
        providerPlaceId: "stub",
        formattedAddress: "Example",
        normalizedAddress: {
          line1: "Example",
          line2: null,
          city: "Test",
          region: "AZ",
          postalCode: "85001",
          countryCode: "US",
        },
        coordinates: null,
        confidence: "exact",
        partialMatch: false,
        warningCodes: [],
        errorCode: null,
      }),
    /valid coordinates/,
  );
});

test("Google Place Details maps into the provider-neutral result", async () => {
  const requestedUrls: string[] = [];
  const provider = new GoogleGeocodingProvider({
    apiKey: "test-key-never-logged",
    fetcher: (async (input: URL | RequestInfo) => {
      requestedUrls.push(String(input));
      return new Response(
        JSON.stringify({
          status: "OK",
          result: {
            place_id: "google-place-1",
            formatted_address: "3058 E Austin Dr, Gilbert, AZ 85296, USA",
            address_components: [
              { long_name: "3058", short_name: "3058", types: ["street_number"] },
              { long_name: "East Austin Drive", short_name: "E Austin Dr", types: ["route"] },
              { long_name: "Gilbert", short_name: "Gilbert", types: ["locality"] },
              { long_name: "Arizona", short_name: "AZ", types: ["administrative_area_level_1"] },
              { long_name: "85296", short_name: "85296", types: ["postal_code"] },
              { long_name: "United States", short_name: "US", types: ["country"] },
            ],
            geometry: { location: { lat: 33.33, lng: -111.79 }, location_type: "ROOFTOP" },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch,
  });
  const result = await provider.resolveAddress({ address, providerPlaceId: "google-place-1" });
  assert.equal(result.status, "verified");
  assert.equal(result.confidence, "exact");
  assert.equal(result.normalizedAddress?.city, "Gilbert");
  assert.deepEqual(result.coordinates, { latitude: 33.33, longitude: -111.79 });
  assert.doesNotMatch(JSON.stringify(result), /test-key-never-logged/);
  assert.equal(requestedUrls.length, 1);
  assert.match(requestedUrls[0], /place_id=google-place-1/);
});

test("Google partial and multiple-candidate results remain ambiguous", async () => {
  const partialProvider = new GoogleGeocodingProvider({
    apiKey: "test",
    fetcher: (async () =>
      new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              place_id: "partial",
              formatted_address: "3058 Austin Dr",
              partial_match: true,
              address_components: [
                { long_name: "3058", short_name: "3058", types: ["street_number"] },
                { long_name: "Austin Drive", short_name: "Austin Dr", types: ["route"] },
                { long_name: "Gilbert", short_name: "Gilbert", types: ["locality"] },
                { long_name: "Arizona", short_name: "AZ", types: ["administrative_area_level_1"] },
                { long_name: "United States", short_name: "US", types: ["country"] },
              ],
              geometry: { location: { lat: 33.33, lng: -111.79 } },
            },
          ],
        }),
      )) as typeof fetch,
  });
  assert.equal((await partialProvider.resolveAddress({ address })).status, "ambiguous");

  const multipleProvider = new GoogleGeocodingProvider({
    apiKey: "test",
    fetcher: (async () =>
      new Response(JSON.stringify({ status: "OK", results: [{}, {}] }))) as typeof fetch,
  });
  assert.equal((await multipleProvider.resolveAddress({ address })).status, "ambiguous");
});

function mockSupabase(beginAction: "resolve" | "cached" | "pending" = "resolve") {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "begin_service_location_geocoding") {
        return {
          data: {
            action: beginAction,
            fingerprint: addressFingerprint(address),
            providerPlaceId: "selected-place",
            address,
          },
          error: null,
        };
      }
      return { data: { status: "verified" }, error: null };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test("resolution service reuses cache and suppresses concurrent pending requests", async () => {
  for (const action of ["cached", "pending"] as const) {
    const { client, calls } = mockSupabase(action);
    const provider = new StubGeocodingProvider();
    const result = await resolveServiceLocationAddress({
      supabase: client,
      businessId: "business",
      serviceLocationId: "location",
      provider,
    });
    assert.equal(result.status, action);
    assert.equal(provider.calls.length, 0);
    assert.equal(calls.length, 1);
  }
});

test("resolution service prefers Place ID and persists normalized success", async () => {
  const { client, calls } = mockSupabase();
  const provider = new StubGeocodingProvider("normalized");
  const result = await resolveServiceLocationAddress({
    supabase: client,
    businessId: "business",
    serviceLocationId: "location",
    provider,
  });
  assert.equal(result.status, "verified");
  assert.equal(provider.calls[0].providerPlaceId, "selected-place");
  assert.equal(calls[1].name, "finish_service_location_geocoding");
  assert.equal(calls[1].args.p_status, "verified");
  assert.deepEqual(calls[1].args.p_normalized_address, {
    line1: "123 Example Street",
    line2: null,
    city: "Testville",
    region: "AZ",
    postalCode: "85001",
    countryCode: "US",
  });
});

test("resolution service persists safe ambiguous and failed states", async () => {
  for (const scenario of ["ambiguous", "provider_failure"] as const) {
    const { client, calls } = mockSupabase();
    const result = await resolveServiceLocationAddress({
      supabase: client,
      businessId: "business",
      serviceLocationId: "location",
      provider: new StubGeocodingProvider(scenario),
      force: true,
    });
    assert.equal(result.ok, false);
    assert.equal(calls[1].args.p_status, scenario === "ambiguous" ? "ambiguous" : "failed");
    assert.equal(calls[1].args.p_latitude, null);
  }
});
