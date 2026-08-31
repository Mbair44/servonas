"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type GoogleAdsOauthLauncherProps = {
 businessSlug: string;
};

const popupMessageType = "servonas:google-ads-oauth-complete";
const popupWidth = 540;
const popupHeight = 720;

function isProbablyMobile() {
 if (typeof window === "undefined") return false;
 return window.matchMedia?.("(max-width: 760px)")?.matches ?? false;
}

function popupFeatures() {
 if (typeof window === "undefined") return "";
 const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - popupWidth) / 2));
 const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - popupHeight) / 2));
 return `popup=yes,width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`;
}

export function GoogleAdsOauthLauncher({ businessSlug }: GoogleAdsOauthLauncherProps) {
 const [status, setStatus] = useState<"idle" | "opening" | "waiting">("idle");
 const [message, setMessage] = useState<string | null>(null);
 const popupRef = useRef<Window | null>(null);
 const pollRef = useRef<number | null>(null);
 const connectHref = useMemo(() => `/api/google-ads/connect/${businessSlug}`, [businessSlug]);
 const popupHref = useMemo(() => `${connectHref}?popup=1`, [connectHref]);

 useEffect(() => {
  const onMessage = (event: MessageEvent) => {
   if (event.origin !== window.location.origin) return;
   if (!event.data || typeof event.data !== "object" || event.data.type !== popupMessageType) return;
   if (pollRef.current) window.clearInterval(pollRef.current);
   popupRef.current = null;
   pollRef.current = null;
   setStatus("idle");
   setMessage(event.data.ok ? "Google account connected. Refreshing this page…" : "Google Ads setup needs attention. Refreshing this page…");
   window.location.assign(typeof event.data.redirectUrl === "string" ? event.data.redirectUrl : `/app/${businessSlug}/marketing/google-ads`);
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
 }, [businessSlug]);

 useEffect(() => () => {
  if (pollRef.current) window.clearInterval(pollRef.current);
 }, []);

 const beginPopup = () => {
  if (isProbablyMobile()) {
   window.location.assign(connectHref);
   return;
  }
  setMessage(null);
  setStatus("opening");
  const popup = window.open(popupHref, "servonas-google-ads-oauth", popupFeatures());
  if (!popup) {
   setStatus("idle");
   setMessage("Your browser blocked the Google sign-in popup, so Servonas opened the regular Google Ads connection flow instead.");
   window.location.assign(connectHref);
   return;
  }
  popupRef.current = popup;
  popup.focus();
  setStatus("waiting");
  pollRef.current = window.setInterval(() => {
   if (!popupRef.current || popupRef.current.closed) {
    if (pollRef.current) window.clearInterval(pollRef.current);
    popupRef.current = null;
    pollRef.current = null;
    setStatus("idle");
    setMessage("The Google sign-in window was closed before setup finished. You can try again whenever you're ready.");
   }
  }, 500);
 };

 return <div className="google-ads-onboarding-launcher">
  <div className="google-ads-onboarding-cta">
   <button type="button" className="sv-button" onClick={beginPopup} disabled={status !== "idle"} data-loading-label="Opening Google sign-in…">
    {status === "waiting" ? "Waiting for Google…" : "Yes, connect my account"}
   </button>
   <a className="sv-button sv-secondary" href={accountCreateHref(connectHref)} target="_blank" rel="noopener noreferrer">No, help me create one</a>
  </div>
  <p className="google-ads-onboarding-help">Use the Google login that has access to your business&apos;s Google Ads account. If you do not have a Google Ads account yet, Servonas will guide you to create one first.</p>
  {message ? <p className="google-ads-onboarding-note" role="status">{message}</p> : null}
 </div>;
}

function accountCreateHref(returnPath: string) {
 const url = new URL("https://ads.google.com/home/");
 url.searchParams.set("continue", returnPath);
 return url.toString();
}
