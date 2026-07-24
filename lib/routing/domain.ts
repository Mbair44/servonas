export const ROUTE_CALCULATION_STATUSES = [
  "not_calculated",
  "queued",
  "calculating",
  "ready",
  "partial",
  "failed",
  "stale",
] as const;

export type RouteCalculationStatus = (typeof ROUTE_CALCULATION_STATUSES)[number];

export const ROUTE_PLAN_STATUSES = ["draft", "active", "archived"] as const;
export type RoutePlanStatus = (typeof ROUTE_PLAN_STATUSES)[number];

export const ROUTE_ENDPOINT_TYPES = [
  "office",
  "technician",
  "custom",
  "first_stop",
  "last_stop",
  "none",
] as const;
export type RouteEndpointType = (typeof ROUTE_ENDPOINT_TYPES)[number];

export const KNOWN_TRAVEL_MODES = ["driving", "walking", "bicycling", "commercial_vehicle"] as const;
export type KnownTravelMode = (typeof KNOWN_TRAVEL_MODES)[number];
export type TravelMode = KnownTravelMode | (string & {});

export type RouteCoordinates = {
  latitude: number;
  longitude: number;
};

export type RouteWaypoint = RouteCoordinates & {
  id: string;
  label?: string;
};

export type RouteProviderWarning = {
  code: string;
  message: string;
};

export type DrivingRouteLeg = {
  fromWaypointId: string;
  toWaypointId: string;
  drivingDistanceMeters: number;
  drivingDurationSeconds: number;
  encodedPolyline: string | null;
  providerWarnings: RouteProviderWarning[];
};

export type DrivingRouteResult = {
  provider: string;
  providerRequestId: string | null;
  encodedPolyline: string | null;
  drivingDistanceMeters: number;
  drivingDurationSeconds: number;
  legs: DrivingRouteLeg[];
  calculatedAt: string;
};

export type ComputeRouteInput = {
  origin: RouteWaypoint;
  destination: RouteWaypoint;
  intermediates: RouteWaypoint[];
  travelMode: TravelMode;
  vehicleProfile?: string;
  departureAt?: string;
};

export type RouteMatrixCell = {
  originWaypointId: string;
  destinationWaypointId: string;
  status: "ready" | "failed";
  drivingDistanceMeters: number | null;
  drivingDurationSeconds: number | null;
  errorCode?: string;
};

export type ComputeRouteMatrixInput = {
  origins: RouteWaypoint[];
  destinations: RouteWaypoint[];
  departureAt?: string;
};

export type OptimizeRouteInput = ComputeRouteInput & {
  lockedWaypointIds: string[];
};

export type RouteOptimizationResult = {
  provider: string;
  providerRequestId: string | null;
  orderedWaypointIds: string[];
  drivingDistanceMeters: number;
  drivingDurationSeconds: number;
  warnings: RouteProviderWarning[];
};

export interface RoutingProvider {
  readonly name: string;
  computeRoute(input: ComputeRouteInput): Promise<DrivingRouteResult>;
  computeRouteMatrix(input: ComputeRouteMatrixInput): Promise<RouteMatrixCell[]>;
}

export interface RouteOptimizationProvider {
  readonly name: string;
  optimizeRoute(input: OptimizeRouteInput): Promise<RouteOptimizationResult>;
}

export function isValidRouteCoordinates(value: RouteCoordinates): boolean {
  return (
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

export function assertValidComputeRouteInput(input: ComputeRouteInput): void {
  const waypoints = [input.origin, ...input.intermediates, input.destination];
  if (waypoints.length < 2) {
    throw new Error("A route requires an origin and destination.");
  }
  if (input.intermediates.length > 25) {
    throw new Error("A route cannot contain more than 25 intermediate waypoints.");
  }
  if (!input.travelMode.trim()) throw new Error("A route requires a travel mode.");

  const ids = new Set<string>();
  for (const waypoint of waypoints) {
    if (!waypoint.id.trim()) throw new Error("Every route waypoint requires an ID.");
    if (ids.has(waypoint.id)) throw new Error(`Duplicate route waypoint ID: ${waypoint.id}`);
    if (!isValidRouteCoordinates(waypoint)) {
      throw new Error(`Route waypoint ${waypoint.id} has invalid coordinates.`);
    }
    ids.add(waypoint.id);
  }

  if (input.departureAt && Number.isNaN(Date.parse(input.departureAt))) {
    throw new Error("Route departure time must be a valid timestamp.");
  }
}

export function assertDrivingMetric(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a nonnegative integer.`);
  }
}

export function validateDrivingRouteResult(
  result: DrivingRouteResult,
  input: ComputeRouteInput,
): void {
  if (!result.provider.trim()) throw new Error("A route result requires a provider.");
  if (Number.isNaN(Date.parse(result.calculatedAt))) {
    throw new Error("A route result requires a valid calculation timestamp.");
  }
  assertDrivingMetric(result.drivingDistanceMeters, "drivingDistanceMeters");
  assertDrivingMetric(result.drivingDurationSeconds, "drivingDurationSeconds");

  const expectedLegCount = input.intermediates.length + 1;
  if (result.legs.length !== expectedLegCount) {
    throw new Error(`Expected ${expectedLegCount} route legs, received ${result.legs.length}.`);
  }

  for (const leg of result.legs) {
    assertDrivingMetric(leg.drivingDistanceMeters, "leg.drivingDistanceMeters");
    assertDrivingMetric(leg.drivingDurationSeconds, "leg.drivingDurationSeconds");
  }
}
