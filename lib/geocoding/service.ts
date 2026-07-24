import type { SupabaseClient } from "@supabase/supabase-js";

import {
  addressFingerprint,
  safeGeocodingError,
  validateResolution,
  validCoordinates,
  type GeocodingProvider,
  type ResolveAddressResult,
  type StructuredAddress,
} from "./domain.ts";

type ResolutionRequest = {
  supabase: SupabaseClient;
  businessId: string;
  serviceLocationId: string;
  provider: GeocodingProvider;
  providerPlaceId?: string | null;
  resolvedResult?: ResolveAddressResult;
  force?: boolean;
};

export type ServiceLocationResolutionResult = {
  ok: boolean;
  status: "verified" | "ambiguous" | "failed" | "manual" | "cached" | "pending" | "stale";
  message: string;
};

type BeginPayload = {
  action: "resolve" | "cached" | "manual" | "pending" | "cooldown";
  fingerprint?: string;
  address?: {
    line1?: string;
    line2?: string | null;
    city?: string;
    region?: string;
    postalCode?: string | null;
    countryCode?: string;
  };
  providerPlaceId?: string | null;
};

function cleanAddress(value: BeginPayload["address"]): StructuredAddress | null {
  if (!value?.line1 || !value.city || !value.region || !value.countryCode) return null;
  return {
    line1: value.line1,
    line2: value.line2 ?? null,
    city: value.city,
    region: value.region,
    postalCode: value.postalCode ?? null,
    countryCode: value.countryCode,
  };
}

export async function resolveServiceLocationAddress(
  request: ResolutionRequest,
): Promise<ServiceLocationResolutionResult> {
  const startedAt = Date.now();
  const context = {
    businessId: request.businessId,
    serviceLocationId: request.serviceLocationId,
    provider: request.provider.name,
  };
  console.info("Service location geocoding requested", context);
  const { data, error } = await request.supabase.rpc("begin_service_location_geocoding", {
    p_business_id: request.businessId,
    p_service_location_id: request.serviceLocationId,
    p_force: request.force ?? false,
    p_provider_place_id: request.providerPlaceId ?? null,
  });
  if (error || !data) {
    console.error("Service location geocoding request rejected", { ...context, code: error?.code });
    return { ok: false, status: "failed", message: "Address verification could not be started." };
  }
  const begin = data as BeginPayload;
  if (begin.action !== "resolve") {
    console.info("Service location geocoding provider request skipped", {
      ...context,
      action: begin.action,
      durationMs: Date.now() - startedAt,
    });
    const status = begin.action === "manual" ? "manual" : begin.action === "pending" ? "pending" : "cached";
    return {
      ok: begin.action !== "cooldown",
      status,
      message:
        begin.action === "cooldown"
          ? "Please wait before retrying address verification."
          : begin.action === "pending"
            ? "Address verification is already in progress."
            : "The saved address verification is current.",
    };
  }

  const address = cleanAddress(begin.address);
  if (!address || begin.fingerprint !== addressFingerprint(address)) {
    console.error("Service location geocoding input was invalid", context);
    return { ok: false, status: "failed", message: "The service address is incomplete." };
  }

  console.info("Service location geocoding provider request started", context);
  let resolution: ResolveAddressResult;
  try {
    resolution = validateResolution(
      request.resolvedResult ??
        (await request.provider.resolveAddress({
          address,
          providerPlaceId: begin.providerPlaceId ?? null,
        })),
    );
  } catch (providerError) {
    resolution = {
      status: "failed",
      provider: request.provider.name,
      providerPlaceId: null,
      formattedAddress: null,
      normalizedAddress: null,
      coordinates: null,
      confidence: "unknown",
      partialMatch: false,
      warningCodes: [],
      errorCode: providerError instanceof Error ? "invalid_provider_response" : "provider_failure",
    };
  }

  const { data: completed, error: completionError } = await request.supabase.rpc(
    "finish_service_location_geocoding",
    {
      p_business_id: request.businessId,
      p_service_location_id: request.serviceLocationId,
      p_address_fingerprint: begin.fingerprint,
      p_status: resolution.status,
      p_provider: resolution.provider,
      p_provider_place_id: resolution.providerPlaceId,
      p_formatted_address: resolution.formattedAddress,
      p_normalized_address: resolution.normalizedAddress,
      p_latitude: resolution.coordinates?.latitude ?? null,
      p_longitude: resolution.coordinates?.longitude ?? null,
      p_confidence: resolution.confidence,
      p_partial_match: resolution.partialMatch,
      p_warning_codes: resolution.warningCodes,
      p_error_code: resolution.errorCode,
    },
  );
  if (completionError) {
    console.error("Service location geocoding persistence failed", {
      ...context,
      code: completionError.code,
      durationMs: Date.now() - startedAt,
    });
    return { ok: false, status: "failed", message: "Address verification could not be saved." };
  }
  if ((completed as { status?: string } | null)?.status === "stale") {
    console.info("Service location geocoding result discarded as stale", {
      ...context,
      durationMs: Date.now() - startedAt,
    });
    return { ok: false, status: "stale", message: "The address changed during verification." };
  }

  const successful = resolution.status === "verified" && validCoordinates(resolution.coordinates);
  const logPayload = {
    ...context,
    status: resolution.status,
    errorCode: resolution.errorCode,
    durationMs: Date.now() - startedAt,
  };
  if (successful) console.info("Service location geocoding provider request succeeded", logPayload);
  else console.warn("Service location geocoding provider request did not verify", logPayload);
  return {
    ok: successful,
    status: resolution.status,
    message:
      resolution.status === "verified"
        ? "Address verified."
        : safeGeocodingError(resolution.errorCode ?? resolution.status),
  };
}

export async function setManualServiceLocationCoordinates(input: {
  supabase: SupabaseClient;
  businessId: string;
  serviceLocationId: string;
  latitude: number;
  longitude: number;
}): Promise<ServiceLocationResolutionResult> {
  if (!validCoordinates({ latitude: input.latitude, longitude: input.longitude })) {
    return { ok: false, status: "failed", message: "Enter valid routing coordinates." };
  }
  const { error } = await input.supabase.rpc("set_service_location_manual_coordinates", {
    p_business_id: input.businessId,
    p_service_location_id: input.serviceLocationId,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
  });
  if (error) {
    console.error("Service location coordinate override failed", {
      businessId: input.businessId,
      serviceLocationId: input.serviceLocationId,
      code: error.code,
    });
    return { ok: false, status: "failed", message: "The routing coordinates could not be saved." };
  }
  console.info("Service location coordinates manually overridden", {
    businessId: input.businessId,
    serviceLocationId: input.serviceLocationId,
  });
  return { ok: true, status: "manual", message: "Manual routing coordinates saved." };
}

export async function clearManualServiceLocationCoordinates(input: {
  supabase: SupabaseClient;
  businessId: string;
  serviceLocationId: string;
}): Promise<ServiceLocationResolutionResult> {
  const { error } = await input.supabase.rpc("clear_service_location_manual_coordinates", {
    p_business_id: input.businessId,
    p_service_location_id: input.serviceLocationId,
  });
  if (error) {
    console.error("Service location coordinate override clear failed", {
      businessId: input.businessId,
      serviceLocationId: input.serviceLocationId,
      code: error.code,
    });
    return { ok: false, status: "failed", message: "The manual coordinates could not be cleared." };
  }
  return { ok: true, status: "stale", message: "Manual coordinates cleared. Verify the address again." };
}
