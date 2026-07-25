import type { RouteWaypoint } from "./domain";

export const GOOGLE_MAX_INTERMEDIATE_WAYPOINTS = 25;
export const GOOGLE_MAX_WAYPOINTS_PER_REQUEST = GOOGLE_MAX_INTERMEDIATE_WAYPOINTS + 2;
export const SERVONAS_MAX_DAILY_ROUTE_STOPS = 250;

export type RouteSegment = {
  index: number;
  startWaypointIndex: number;
  waypoints: RouteWaypoint[];
};

export function splitRouteWaypoints(
  waypoints: RouteWaypoint[],
  maximumWaypoints = GOOGLE_MAX_WAYPOINTS_PER_REQUEST,
): RouteSegment[] {
  if (maximumWaypoints < 2) throw new Error("A route segment must support at least two waypoints.");
  if (waypoints.length < 2) return [];
  const segments: RouteSegment[] = [];
  let startWaypointIndex = 0;
  while (startWaypointIndex < waypoints.length - 1) {
    const segmentWaypoints = waypoints.slice(startWaypointIndex, startWaypointIndex + maximumWaypoints);
    segments.push({ index: segments.length, startWaypointIndex, waypoints: segmentWaypoints });
    startWaypointIndex += segmentWaypoints.length - 1;
  }
  return segments;
}

export type PolylinePoint = { latitude: number; longitude: number };

export function decodePolyline(value: string): PolylinePoint[] {
  const points: PolylinePoint[] = [];
  let index = 0, latitude = 0, longitude = 0;
  while (index < value.length) {
    const decodeValue = () => {
      let result = 0, shift = 0, byte = 0;
      do {
        if (index >= value.length) throw new Error("Invalid encoded polyline.");
        byte = value.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      return result & 1 ? ~(result >> 1) : result >> 1;
    };
    latitude += decodeValue();
    longitude += decodeValue();
    points.push({ latitude: latitude / 1e5, longitude: longitude / 1e5 });
  }
  return points;
}

export function encodePolyline(points: PolylinePoint[]): string {
  let previousLatitude = 0, previousLongitude = 0;
  const encodeValue = (delta: number) => {
    let value = delta < 0 ? ~(delta << 1) : delta << 1;
    let output = "";
    while (value >= 0x20) {
      output += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>= 5;
    }
    return output + String.fromCharCode(value + 63);
  };
  return points.map((point) => {
    const latitude = Math.round(point.latitude * 1e5);
    const longitude = Math.round(point.longitude * 1e5);
    const encoded = encodeValue(latitude - previousLatitude) + encodeValue(longitude - previousLongitude);
    previousLatitude = latitude;
    previousLongitude = longitude;
    return encoded;
  }).join("");
}

export function mergeEncodedPolylines(values: string[]): string | null {
  const merged: PolylinePoint[] = [];
  for (const value of values) {
    if (!value) continue;
    const points = decodePolyline(value);
    if (merged.length && points.length) {
      const previous = merged.at(-1)!;
      const first = points[0];
      if (previous.latitude === first.latitude && previous.longitude === first.longitude) points.shift();
    }
    merged.push(...points);
  }
  return merged.length ? encodePolyline(merged) : null;
}
