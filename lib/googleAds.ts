export const GOOGLE_ADS_SIGNUP_CONVERSION =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION ??
  "AW-18340749438/-fjTCKncxtscEP7AxqlE";

type GoogleTag = (...args: unknown[]) => void;

export function trackGoogleAdsConversion(sendTo: string, onceKey?: string) {
  if (typeof window === "undefined") return false;
  const storageKey = onceKey ? `servonas.google-ads-conversion.${onceKey}` : null;
  try {
    if (storageKey && window.sessionStorage.getItem(storageKey) === "sent") return false;
    const gtag = (window as typeof window & { gtag?: GoogleTag }).gtag;
    if (typeof gtag !== "function") return false;
    gtag("event", "conversion", { send_to: sendTo });
    if (storageKey) window.sessionStorage.setItem(storageKey, "sent");
    return true;
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.debug("Google Ads conversion tracking skipped", error);
    return false;
  }
}

export function trackGoogleAdsSignupConversion(userId: string) {
  return trackGoogleAdsConversion(GOOGLE_ADS_SIGNUP_CONVERSION, `signup.${userId}`);
}
