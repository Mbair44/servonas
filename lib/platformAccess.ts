type AuthUser = {
  email?: string | null;
  email_confirmed_at?: string | null;
};

export const platformAdminRole = "platform_admin";

export function isServonasPlatformAdmin(user: AuthUser | null | undefined) {
  const email = user?.email?.trim().toLowerCase() ?? "";
  return Boolean(user?.email_confirmed_at && /^[^@\s]+@servonas\.com$/.test(email));
}
