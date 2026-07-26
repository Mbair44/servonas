export type GoogleMapsLibraryHost = {
  importLibrary?: (name: string) => Promise<unknown>;
};

export async function requireGoogleMapsLibrary<T extends GoogleMapsLibraryHost>(
  maps: T,
  name: string,
  isReady: (maps: T) => boolean,
) {
  if (isReady(maps)) return maps;
  if (!maps.importLibrary) {
    throw new Error(`Google Maps ${name} library is unavailable.`);
  }
  await maps.importLibrary(name);
  if (!isReady(maps)) {
    throw new Error(`Google Maps ${name} library did not initialize.`);
  }
  return maps;
}
