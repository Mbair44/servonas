"use client";

import { useEffect, useState } from "react";

const interactiveSelector = [
 "form",
 "a[href]",
].join(",");

function actionableLink(target: EventTarget | null) {
 const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
 if (!anchor) return null;
 const href = anchor.getAttribute("href") ?? "";
 if (!href || href.startsWith("#") || anchor.hasAttribute("download")) return null;
 return anchor;
}

export function GoogleAdsPageLoadingOverlay() {
 const [active, setActive] = useState(false);
 const [message, setMessage] = useState("Working on Google Ads…");

 useEffect(() => {
  const root = document.querySelector(".google-ads-page");
  if (!root) return;

  const activate = (nextMessage: string) => {
   setMessage(nextMessage);
   setActive(true);
  };

  const onSubmit = (event: SubmitEvent) => {
   const form = event.target instanceof HTMLFormElement ? event.target : null;
   if (!form || !form.closest(".google-ads-page")) return;
   const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
   const label = submitter?.getAttribute("data-loading-label")?.trim()
    || submitter?.textContent?.trim()
    || "Working on Google Ads…";
   activate(label);
  };

  const onClick = (event: MouseEvent) => {
   const anchor = actionableLink(event.target);
   if (!anchor || !anchor.closest(".google-ads-page")) return;
   const label = anchor.getAttribute("data-loading-label")?.trim()
    || anchor.textContent?.trim()
    || "Working on Google Ads…";
   activate(label);
  };

  document.addEventListener("submit", onSubmit, true);
  document.addEventListener("click", onClick, true);
  return () => {
   document.removeEventListener("submit", onSubmit, true);
   document.removeEventListener("click", onClick, true);
  };
 }, []);

 if (!active) return null;
 return <div className="google-ads-page-overlay" role="status" aria-live="assertive" aria-busy="true">
  <section>
   <span className="google-ads-page-overlay-spinner" aria-hidden="true" />
   <h2>{message}</h2>
   <p>Servonas is processing this Google Ads action. Please keep this page open.</p>
  </section>
 </div>;
}
