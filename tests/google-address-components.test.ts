import assert from "node:assert/strict";
import test from "node:test";
import { parseGoogleAddressComponents } from "../lib/googleAddressComponents.ts";

test("maps a Google address into structured service-location fields", () => {
  const parsed = parseGoogleAddressComponents([
    { long_name: "3058", short_name: "3058", types: ["street_number"] },
    { long_name: "East Austin Drive", short_name: "E Austin Dr", types: ["route"] },
    { long_name: "Gilbert", short_name: "Gilbert", types: ["locality"] },
    { long_name: "Arizona", short_name: "AZ", types: ["administrative_area_level_1"] },
    { long_name: "85296", short_name: "85296", types: ["postal_code"] },
    { long_name: "United States", short_name: "US", types: ["country"] },
  ]);
  assert.deepEqual(parsed, {
    streetAddress: "3058 East Austin Drive",
    unit: "",
    city: "Gilbert",
    state: "AZ",
    postalCode: "85296",
    country: "US",
  });
});

test("uses international locality fallbacks and separates unit and postal suffix", () => {
  const parsed = parseGoogleAddressComponents([
    { long_name: "10", short_name: "10", types: ["street_number"] },
    { long_name: "High Street", short_name: "High St", types: ["route"] },
    { long_name: "Flat 4", short_name: "Flat 4", types: ["subpremise"] },
    { long_name: "Oxford", short_name: "Oxford", types: ["postal_town"] },
    { long_name: "Oxfordshire", short_name: "Oxfordshire", types: ["administrative_area_level_1"] },
    { long_name: "OX1", short_name: "OX1", types: ["postal_code"] },
    { long_name: "1AA", short_name: "1AA", types: ["postal_code_suffix"] },
    { long_name: "United Kingdom", short_name: "GB", types: ["country"] },
  ]);
  assert.equal(parsed.unit, "Flat 4");
  assert.equal(parsed.city, "Oxford");
  assert.equal(parsed.postalCode, "OX1-1AA");
  assert.equal(parsed.country, "GB");
});
