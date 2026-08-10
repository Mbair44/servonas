import { isServonasPlatformAdmin } from "../platformAccess.ts";

type ProvisioningUser = Parameters<typeof isServonasPlatformAdmin>[0];

export function canProvisionBusinessTwilioSubaccount(user: ProvisioningUser) {
  return isServonasPlatformAdmin(user);
}
