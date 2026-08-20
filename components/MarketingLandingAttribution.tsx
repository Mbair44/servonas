"use client";

import type { WebsiteFirstSource } from "@/lib/websiteFirstConfig";
import { AcquisitionBuilderLinkTracker, AcquisitionFunnelTracker } from "@/components/AcquisitionFunnelTracker";

export function MarketingLandingAttribution({ source }: { source: WebsiteFirstSource }) {
  return <>
    <AcquisitionFunnelTracker industry={source} event="marketing_landing_view" />
    <AcquisitionBuilderLinkTracker industry={source} />
  </>;
}
