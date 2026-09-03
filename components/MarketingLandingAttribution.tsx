"use client";

import { AcquisitionBuilderLinkTracker, AcquisitionFunnelTracker, AcquisitionSignupLinkTracker } from "@/components/AcquisitionFunnelTracker";

export function MarketingLandingAttribution({ source, trackSignup = false, initialSessionId }: { source: string; trackSignup?: boolean; initialSessionId?: string }) {
  return <>
    <AcquisitionFunnelTracker industry={source} event="marketing_landing_view" initialSessionId={initialSessionId} />
    {trackSignup ? <AcquisitionSignupLinkTracker industry={source} /> : <AcquisitionBuilderLinkTracker industry={source} />}
  </>;
}
