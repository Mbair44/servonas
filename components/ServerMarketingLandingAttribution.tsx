import {MarketingLandingAttribution} from "@/components/MarketingLandingAttribution";
import {ensureMarketingAcquisitionSession} from "@/lib/acquisitionTracking";

export async function ServerMarketingLandingAttribution({
  source,
  path,
  searchParams,
  trackSignup = false,
}: {
  source: string;
  path: string;
  searchParams?: Record<string, string | string[] | undefined>;
  trackSignup?: boolean;
}) {
  const {sessionId} = await ensureMarketingAcquisitionSession({industry: source, path, searchParams});
  return <MarketingLandingAttribution source={source} trackSignup={trackSignup} initialSessionId={sessionId} />;
}
