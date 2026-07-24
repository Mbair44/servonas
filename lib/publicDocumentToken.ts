const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generatePublicDocumentToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  return Buffer.from(bytes).toString("base64url");
}

export function validPublicDocumentToken(token: string) {
  return TOKEN_PATTERN.test(token);
}

export async function publicDocumentTokenHash(token: string) {
  if (!validPublicDocumentToken(token)) throw new Error("Invalid public document token.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return `\\x${Buffer.from(digest).toString("hex")}`;
}
