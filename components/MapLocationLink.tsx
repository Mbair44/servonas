import type { ReactNode } from "react";

/** Opens an address in maps on desktop and the device's map app where supported. */
export function mapLocationHref(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

export function MapLocationLink({ address, children, className }: { address: string | null | undefined; children?: ReactNode; className?: string }) {
  const value = address?.trim();
  if (!value) return <>{children ?? "No address"}</>;
  return <a className={className ?? "map-location-link"} href={mapLocationHref(value)} target="_blank" rel="noreferrer" aria-label={`Open ${value} in maps`}>{children ?? value}<span className="map-location-link-icon" aria-hidden="true">↗</span></a>;
}
