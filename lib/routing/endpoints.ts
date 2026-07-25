import type { SupabaseClient } from "@supabase/supabase-js";
import type { RouteWaypoint } from "./domain";

type Endpoint = {
  type: "office" | "technician" | "custom" | "first_stop" | "last_stop" | "none";
  label: string;
  address: string | null;
  waypoint: RouteWaypoint | null;
  isPrivate: boolean;
};

const point = (id: string, latitude: unknown, longitude: unknown) => {
  const lat = Number(latitude), lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { id, latitude: lat, longitude: lng } : null;
};

export async function resolveRouteEndpoints({
  admin, businessId, technicianId, firstStop, lastStop,
}: {
  admin: SupabaseClient; businessId: string; technicianId: string; firstStop: RouteWaypoint; lastStop: RouteWaypoint;
}): Promise<{ origin: Endpoint; destination: Endpoint }> {
  const [{ data: defaults }, { data: override }] = await Promise.all([
    admin.from("business_route_endpoint_defaults").select("*").eq("business_id", businessId).maybeSingle(),
    admin.from("technician_route_endpoint_overrides").select("*").eq("business_id", businessId).eq("technician_id", technicianId).maybeSingle(),
  ]);
  const startMode = override?.start_mode && override.start_mode !== "inherit" ? override.start_mode : defaults?.start_mode ?? "first_job";
  const endMode = override?.end_mode && override.end_mode !== "inherit" ? override.end_mode : defaults?.end_mode ?? "last_job";
  const endpoint = (mode: string, side: "start" | "end"): Endpoint => {
    if (mode === "first_job") return { type: "first_stop", label: "First job", address: null, waypoint: firstStop, isPrivate: false };
    if (mode === "last_job") return { type: "last_stop", label: "Last job", address: null, waypoint: lastStop, isPrivate: false };
    if (mode === "none") return { type: "none", label: side === "start" ? "No route origin" : "No route destination", address: null, waypoint: null, isPrivate: false };
    if (mode === "home") return {
      type: "technician", label: side === "start" ? "Private technician start" : "Private technician end",
      address: null, waypoint: point(`__${side}`, override?.home_latitude, override?.home_longitude), isPrivate: true,
    };
    if (mode === "office") return {
      type: "office", label: defaults?.office_label ?? "Main office", address: defaults?.office_address ?? null,
      waypoint: point(`__${side}`, defaults?.office_latitude, defaults?.office_longitude), isPrivate: false,
    };
    return {
      type: "custom", label: override?.[`${side === "start" ? "custom_start" : "custom_end"}_label`] ?? defaults?.[`${side === "start" ? "custom_start" : "custom_end"}_label`] ?? "Custom endpoint",
      address: override?.[`${side === "start" ? "custom_start" : "custom_end"}_address`] ?? defaults?.[`${side === "start" ? "custom_start" : "custom_end"}_address`] ?? null,
      waypoint: point(`__${side}`,
        override?.[`${side === "start" ? "custom_start" : "custom_end"}_latitude`] ?? defaults?.[`${side === "start" ? "custom_start" : "custom_end"}_latitude`],
        override?.[`${side === "start" ? "custom_start" : "custom_end"}_longitude`] ?? defaults?.[`${side === "start" ? "custom_start" : "custom_end"}_longitude`]),
      isPrivate: false,
    };
  };
  return { origin: endpoint(startMode, "start"), destination: endpoint(endMode, "end") };
}
