export function getTwilioCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const usesApiKey = Boolean(apiKeySid && apiKeySecret);

  return {
    accountSid,
    from,
    username: usesApiKey ? apiKeySid : accountSid,
    password: usesApiKey ? apiKeySecret : authToken,
    configured: Boolean(accountSid && from && (usesApiKey || authToken)),
    authentication: usesApiKey ? "api_key" : "auth_token",
  } as const;
}
