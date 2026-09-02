"use client";

import { AcquisitionBuilderLinkTracker, AcquisitionFunnelTracker, AcquisitionSignupLinkTracker } from "@/components/AcquisitionFunnelTracker";

export function MarketingLandingAttribution({ source, trackSignup = false }: { source: string; trackSignup?: boolean }) {
  return <>
    <AcquisitionFunnelTracker industry={source} event="marketing_landing_view" />
    {trackSignup ? <AcquisitionSignupLinkTracker industry={source} /> : <AcquisitionBuilderLinkTracker industry={source} />}
  </>;
}
