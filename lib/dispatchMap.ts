export function routableLocationCoordinates(location: {
  geocodingStatus: string | null | undefined;
  latitude: number | string | null | undefined;
  longitude: number | string | null | undefined;
}): { latitude: number; longitude: number } | null {
  if (!["verified", "manual"].includes(location.geocodingStatus ?? "")) return null;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) return null;
  return { latitude, longitude };
}

export function scheduledStopSequence<T extends {
  id: string;
  assignedTechnicianId: string | null;
}>(jobs: T[], technicianIds: string[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const technicianId of technicianIds) {
    jobs
      .filter((job) => job.assignedTechnicianId === technicianId)
      .forEach((job, index) => result.set(job.id, index + 1));
  }
  return result;
}

