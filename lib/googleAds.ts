export const GOOGLE_ADS_SIGNUP_CONVERSION =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_CONVERSION ??
  "AW-18340749438/-fjTCKncxtscEP7AxqlE";

type GoogleTag = (...args: unknown[]) => void;
type GoogleAdsConversionOptions={
 onceKey?:string;
 eventCallback?:()=>void;
 value?:number;
 currency?:string;
};

export function trackGoogleAdsConversion(sendTo:string,options:GoogleAdsConversionOptions={}) {
  if (typeof window === "undefined") return false;
  const storageKey=options.onceKey?`servonas.google-ads-conversion.${options.onceKey}`:null;
  try {
    if (storageKey && window.sessionStorage.getItem(storageKey) === "sent") return false;
    const gtag = (window as typeof window & { gtag?: GoogleTag }).gtag;
    if (typeof gtag !== "function") return false;
    gtag("event","conversion",{
      send_to:sendTo,
      ...(options.eventCallback?{event_callback:options.eventCallback}:{}),
      ...(typeof options.value==="number"?{value:options.value}:{}),
      ...(options.currency?{currency:options.currency}:{}),
    });
    // Mark sent only after gtag accepted the event without throwing.
    if (storageKey) window.sessionStorage.setItem(storageKey, "sent");
    return true;
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.debug("Google Ads conversion tracking skipped", error);
    return false;
  }
}

export function trackGoogleAdsBookingConversion(bookingId:string,value:number,currency="USD"){
 const sendTo=process.env.NEXT_PUBLIC_GOOGLE_ADS_BOOKING_CONVERSION?.trim();
 return sendTo?trackGoogleAdsConversion(sendTo,{onceKey:`booking.${bookingId}`,value,currency}):false;
}

export function trackGoogleAdsSignupConversion(userId:string,eventCallback?:()=>void) {
  return trackGoogleAdsConversion(GOOGLE_ADS_SIGNUP_CONVERSION,{onceKey:`signup.${userId}`,eventCallback});
}
