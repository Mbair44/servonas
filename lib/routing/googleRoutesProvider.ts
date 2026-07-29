import {
  assertValidComputeRouteInput,
  validateDrivingRouteResult,
  type ComputeRouteInput,
  type ComputeRouteMatrixInput,
  type DrivingRouteResult,
  type RouteMatrixCell,
  type RoutingProvider,
} from "./domain.ts";

type GoogleLeg = {
  distanceMeters?: number;
  duration?: string;
  polyline?: { encodedPolyline?: string };
};
type GoogleRoute = {
  distanceMeters?: number;
  duration?: string;
  polyline?: { encodedPolyline?: string };
  legs?: GoogleLeg[];
};
type GoogleMatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  condition?: string;
  status?: { code?: number; message?: string };
};

const seconds = (duration: string | undefined) => {
  const value = Number(duration?.replace(/s$/, ""));
  if (!Number.isFinite(value) || value < 0) throw new Error("The routing provider returned an invalid duration.");
  return Math.round(value);
};

const waypoint = (latitude: number, longitude: number) => ({
  location: { latLng: { latitude, longitude } },
});

export class GoogleRoutesProvider implements RoutingProvider {
  readonly name = "google_routes";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("GOOGLE_ROUTES_API_KEY is not configured.");
    this.apiKey = apiKey;
  }

  async computeRoute(input: ComputeRouteInput): Promise<DrivingRouteResult> {
    assertValidComputeRouteInput(input);
    if (input.travelMode !== "driving") {
      throw new Error(`Google Routes travel mode is not configured for ${input.travelMode}.`);
    }
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration,routes.legs.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: waypoint(input.origin.latitude, input.origin.longitude),
        destination: waypoint(input.destination.latitude, input.destination.longitude),
        intermediates: input.intermediates.map((item) => waypoint(item.latitude, item.longitude)),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        polylineQuality: "OVERVIEW",
        polylineEncoding: "ENCODED_POLYLINE",
        ...(input.departureAt ? { departureTime: input.departureAt } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-guploader-uploadid");
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google Routes request failed (${response.status}): ${body.slice(0, 500)}`);
    }
    const payload = await response.json() as { routes?: GoogleRoute[] };
    const route = payload.routes?.[0];
    if (!route) throw new Error("Google Routes returned no drivable route.");
    const ordered = [input.origin, ...input.intermediates, input.destination];
    const result: DrivingRouteResult = {
      provider: this.name,
      providerRequestId: requestId,
      encodedPolyline: route.polyline?.encodedPolyline ?? null,
      drivingDistanceMeters: Math.round(route.distanceMeters ?? 0),
      drivingDurationSeconds: seconds(route.duration),
      calculatedAt: new Date().toISOString(),
      legs: (route.legs ?? []).map((leg, index) => ({
        fromWaypointId: ordered[index].id,
        toWaypointId: ordered[index + 1].id,
        drivingDistanceMeters: Math.round(leg.distanceMeters ?? 0),
        drivingDurationSeconds: seconds(leg.duration),
        encodedPolyline: leg.polyline?.encodedPolyline ?? null,
        providerWarnings: [],
      })),
    };
    validateDrivingRouteResult(result, input);
    return result;
  }

  async computeRouteMatrix(input: ComputeRouteMatrixInput): Promise<RouteMatrixCell[]> {
    if (!input.origins.length || !input.destinations.length) return [];
    if (input.origins.length > 25 || input.destinations.length > 25
      || input.origins.length * input.destinations.length > 625) {
      throw new Error("Google Routes matrix supports at most 625 elements.");
    }
    const response = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status,condition",
      },
      body: JSON.stringify({
        origins: input.origins.map((item) => ({ waypoint: waypoint(item.latitude, item.longitude) })),
        destinations: input.destinations.map((item) => ({ waypoint: waypoint(item.latitude, item.longitude) })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        ...(input.departureAt ? { departureTime: input.departureAt } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google Routes matrix request failed (${response.status}): ${body.slice(0, 500)}`);
    }
    const payload = await response.json() as GoogleMatrixElement[];
    return payload.flatMap((element) => {
      const origin = input.origins[element.originIndex ?? -1];
      const destination = input.destinations[element.destinationIndex ?? -1];
      if (!origin || !destination) return [];
      const ready = element.condition === "ROUTE_EXISTS"
        && !element.status?.code
        && element.distanceMeters !== undefined
        && element.duration !== undefined;
      return [{
        originWaypointId: origin.id,
        destinationWaypointId: destination.id,
        status: ready ? "ready" as const : "failed" as const,
        drivingDistanceMeters: ready ? Math.round(element.distanceMeters!) : null,
        drivingDurationSeconds: ready ? seconds(element.duration) : null,
        ...(ready ? {} : { errorCode: element.status?.message ?? element.condition ?? "matrix_route_failed" }),
      }];
    });
  }
}
