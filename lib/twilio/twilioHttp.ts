export type TwilioHttpClient = {
  request<T>(url: string, init?: RequestInit): Promise<T>;
};

export function getParentTwilioHttpClient(): TwilioHttpClient {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const keySid = process.env.TWILIO_API_KEY_SID?.trim();
  const keySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
  if (!accountSid || !keySid || !keySecret) {
    throw new Error("Parent Twilio API-key credentials are not configured.");
  }
  return {
    async request<T>(url: string, init?: RequestInit): Promise<T> {
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Basic ${Buffer.from(`${keySid}:${keySecret}`).toString("base64")}`,
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
      });
      const value = await response.json().catch(() => ({})) as T & { message?: string };
      if (!response.ok) {
        // Never include a provider response in durable state or logs. Callers get a
        // stable status-only error that is safe to expose to a platform admin.
        throw new Error(`Twilio request failed (${response.status}).`);
      }
      return value;
    },
  };
}

export const formRequest = (values: Record<string, string>) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(values),
});
