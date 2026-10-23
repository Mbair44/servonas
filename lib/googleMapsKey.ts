export function publicGoogleMapsApiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim() || undefined;
}

/**
 * The Maps JavaScript SDK runs in the customer's browser.  It must never be
 * given the server key that is used for address verification and Routes API
 * requests.  Configure this key with HTTP-referrer restrictions.
 */
export function browserGoogleMapsApiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || undefined;
}
