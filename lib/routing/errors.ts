const clean = (value: string) => value
  .replace(/AIza[0-9A-Za-z_-]+/g, "[redacted key]")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 240);

export function publicRouteCalculationError(error: unknown): string {
  const message = clean(error instanceof Error ? error.message : String(error));
  const google = message.match(/Google Routes request failed \((\d{3})\):\s*(.*)/);
  if (google) {
    let reason = google[2];
    try {
      const parsed = JSON.parse(reason) as { error?: { message?: string; status?: string } };
      reason = [parsed.error?.status, parsed.error?.message].filter(Boolean).join(": ") || reason;
    } catch {
      // The provider may return plain text. The cleaned, length-limited text is safe to show.
    }
    return `Google Routes returned HTTP ${google[1]}${reason ? `: ${clean(reason)}` : "."}`;
  }
  if (/GOOGLE_ROUTES_API_KEY is not configured/i.test(message)) {
    return "GOOGLE_ROUTES_API_KEY is missing from this deployment environment.";
  }
  if (/Unsupported routing provider/i.test(message)) return message;
  const databaseCode = message.match(/\(([0-9A-Z]{5}|PGRST\d+|missing)\)/i)?.[1];
  if (/route plan|technician route|scheduled route jobs|route legs|route stops|calculated routes/i.test(message)) {
    const undefinedColumn = message.match(/column\s+(?:"?[\w.]+"?)\s+does not exist/i)?.[0];
    return undefinedColumn
      ? `Routing database operation failed${databaseCode ? ` (${databaseCode})` : ""}: ${undefinedColumn}.`
      : `Routing database operation failed${databaseCode ? ` (${databaseCode})` : ""}. Confirm the Epic 7 routing migration is installed.`;
  }
  if (/timeout|timed out|abort/i.test(message)) {
    return "Google Routes did not respond before the server timeout. Try again.";
  }
  return `Road routes could not be calculated: ${message || "unknown server error"}`;
}
