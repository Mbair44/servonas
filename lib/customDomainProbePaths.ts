const exactProbePaths = new Set([
  "/wp-admin",
  "/wp-login.php",
  "/xmlrpc.php",
  "/wp-config.php",
]);

const probePrefixes = [
  "/wp-admin/",
  "/wp-content/",
  "/wp-includes/",
  "/wp-json/",
];

export function isBlockedCustomDomainProbePath(pathname: string) {
  const path = pathname.trim().toLowerCase();
  if (!path.startsWith("/")) return false;
  if (exactProbePaths.has(path)) return true;
  return probePrefixes.some((prefix) => path.startsWith(prefix));
}
