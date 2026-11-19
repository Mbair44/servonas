/**
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is
 * configured for the deployment. Mutation-capable cron routes must never run
 * without that configured secret.
 */
export function isAuthorizedCronRequest(request: Pick<Request, "headers">) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secret.trim()) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
