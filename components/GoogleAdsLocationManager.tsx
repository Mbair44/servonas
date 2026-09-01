"use client";

import { useMemo, useState } from "react";
import type { GoogleAdsCampaignLocation, GoogleAdsCampaignLocationTargeting, GoogleAdsGeoTargetSuggestion } from "@/lib/googleAdsManagement";

function friendlyGeoTargetType(value: string | null | undefined) {
 return value ? value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Unknown";
}

function campaignLocationSummary(locations: Array<{ canonicalName: string | null; name: string }>) {
 if (!locations.length) return "No locations set";
 const names = locations.map((location) => location.canonicalName || location.name);
 if (names.length <= 2) return names.join(", ");
 return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

type Props = {
 businessSlug: string;
 campaignId: string;
 initialTargeting: GoogleAdsCampaignLocationTargeting | null;
 initialError?: string | null;
 initialOpen?: boolean;
};

type MutationState = {
 busy: boolean;
 kind: "search" | "add" | "remove" | null;
 key: string | null;
};

export function GoogleAdsLocationManager({ businessSlug, campaignId, initialTargeting, initialError = null, initialOpen = false }: Props) {
 const [targeting, setTargeting] = useState<GoogleAdsCampaignLocationTargeting | null>(initialTargeting);
 const [query, setQuery] = useState("");
 const [results, setResults] = useState<GoogleAdsGeoTargetSuggestion[]>([]);
 const [open, setOpen] = useState(initialOpen);
 const [message, setMessage] = useState<string | null>(null);
 const [error, setError] = useState<string | null>(initialError);
 const [mutation, setMutation] = useState<MutationState>({ busy: false, kind: null, key: null });

 const targetedLocations = targeting?.targetedLocations ?? [];
 const excludedLocations = targeting?.excludedLocations ?? [];

 const targetedSet = useMemo(() => new Set(targetedLocations.map((location) => location.geoTargetConstant)), [targetedLocations]);

 async function parseJson(response: Response) {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
 }

 async function searchLocations(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const trimmed = query.trim();
  if (!trimmed) {
   setResults([]);
   setError(null);
   return;
  }
  setMutation({ busy: true, kind: "search", key: null });
  setMessage(null);
  setError(null);
  try {
   const response = await fetch(`/api/google-ads/location-search/${encodeURIComponent(businessSlug)}/${encodeURIComponent(campaignId)}?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
   const payload = await parseJson(response);
   if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Google Ads locations could not be searched.");
   setResults(Array.isArray(payload.results) ? payload.results as GoogleAdsGeoTargetSuggestion[] : []);
   setOpen(true);
  } catch (nextError) {
   setError(nextError instanceof Error ? nextError.message : "Google Ads locations could not be searched.");
  } finally {
   setMutation({ busy: false, kind: null, key: null });
  }
 }

 async function addLocation(geoTargetConstant: string) {
  setMutation({ busy: true, kind: "add", key: geoTargetConstant });
  setMessage(null);
  setError(null);
  try {
   const response = await fetch(`/api/google-ads/campaign-locations/${encodeURIComponent(businessSlug)}/${encodeURIComponent(campaignId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ geoTargetConstant }),
   });
   const payload = await parseJson(response);
   if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Campaign location could not be added.");
   setTargeting((payload.locations as GoogleAdsCampaignLocationTargeting | undefined) ?? targeting);
   setResults((current) => current.filter((result) => result.resourceName !== geoTargetConstant));
   setQuery("");
   setMessage(typeof payload.message === "string" ? payload.message : "Location added.");
  } catch (nextError) {
   setError(nextError instanceof Error ? nextError.message : "Campaign location could not be added.");
  } finally {
   setMutation({ busy: false, kind: null, key: null });
  }
 }

 async function removeLocation(location: GoogleAdsCampaignLocation) {
  if (!location.criterionResourceName) return;
  setMutation({ busy: true, kind: "remove", key: location.criterionResourceName });
  setMessage(null);
  setError(null);
  try {
   const response = await fetch(`/api/google-ads/campaign-locations/${encodeURIComponent(businessSlug)}/${encodeURIComponent(campaignId)}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ criterionResourceName: location.criterionResourceName }),
   });
   const payload = await parseJson(response);
   if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Campaign location could not be removed.");
   setTargeting((payload.locations as GoogleAdsCampaignLocationTargeting | undefined) ?? targeting);
   setMessage(typeof payload.message === "string" ? payload.message : "Location removed.");
  } catch (nextError) {
   setError(nextError instanceof Error ? nextError.message : "Campaign location could not be removed.");
  } finally {
   setMutation({ busy: false, kind: null, key: null });
  }
 }

 return <>
  {error ? <div className="workspace-notice warning">{error}</div> : null}
  {message ? <div className="workspace-notice success">{message}</div> : null}
  <div className="google-ads-location-summary-card">
   <div>
    <span>Targeted locations</span>
    <strong>{targetedLocations.length ? campaignLocationSummary(targetedLocations) : "No locations currently configured"}</strong>
   </div>
   <div>
    <span>Targeting behavior</span>
    <strong>{friendlyGeoTargetType(targeting?.positiveGeoTargetType)}</strong>
   </div>
   <div>
    <span>Excluded locations</span>
    <strong>{excludedLocations.length || "None"}</strong>
   </div>
  </div>
  <details className="google-ads-location-manager" open={open} onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
   <summary>{targetedLocations.length ? "Manage locations" : "Add locations"}</summary>
   <div className="google-ads-location-lists">
    <div>
     <strong>Targeted locations</strong>
     {targetedLocations.length ? <div className="google-ads-location-list">{targetedLocations.map((location) => <article key={location.geoTargetConstant}>
      <span>
       <b>{location.canonicalName || location.name}</b>
       <small>{location.targetType ? `${friendlyGeoTargetType(location.targetType)}${location.countryCode ? ` · ${location.countryCode}` : ""}` : location.countryCode ?? "Google Ads location"}</small>
      </span>
      <button className="sv-button sv-secondary" type="button" disabled={!location.criterionResourceName || mutation.busy} onClick={() => void removeLocation(location)}>
       {mutation.kind === "remove" && mutation.key === location.criterionResourceName ? "Removing…" : targetedLocations.length === 1 ? "Remove last target" : "Remove"}
      </button>
     </article>)}</div> : <p className="google-ads-location-empty">No locations are currently targeted.</p>}
     {targetedLocations.length === 1 ? <small className="google-ads-location-warning">Removing this location will leave this campaign without any explicit location targeting.</small> : null}
    </div>
    {excludedLocations.length ? <div>
     <strong>Excluded locations</strong>
     <div className="google-ads-location-list">{excludedLocations.map((location) => <article key={location.geoTargetConstant}>
      <span>
       <b>{location.canonicalName || location.name}</b>
       <small>{location.targetType ? `${friendlyGeoTargetType(location.targetType)}${location.countryCode ? ` · ${location.countryCode}` : ""}` : location.countryCode ?? "Google Ads location"}</small>
      </span>
     </article>)}</div>
    </div> : null}
   </div>
   <form className="google-ads-location-search" onSubmit={(event) => void searchLocations(event)}>
    <label>Search city, county, state, or ZIP
     <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Gilbert, Maricopa County, Arizona, 85296" />
    </label>
    <button className="sv-button sv-secondary" type="submit" disabled={mutation.busy}>{mutation.kind === "search" ? "Searching…" : "Search locations"}</button>
   </form>
   {results.length ? <div className="google-ads-location-search-results">
    <strong>Add another location</strong>
    <div className="google-ads-location-list">{results.map((result) => {
     const alreadyTargeted = targetedSet.has(result.resourceName);
     return <article key={result.resourceName}>
      <span>
       <b>{result.canonicalName || result.name}</b>
       <small>{[result.targetType ? friendlyGeoTargetType(result.targetType) : null, result.countryCode].filter(Boolean).join(" · ") || "Google Ads geo target"}</small>
      </span>
      <button className="sv-button sv-secondary" type="button" disabled={alreadyTargeted || mutation.busy} onClick={() => void addLocation(result.resourceName)}>
       {alreadyTargeted ? "Already targeted" : mutation.kind === "add" && mutation.key === result.resourceName ? "Adding…" : "Add location"}
      </button>
     </article>;
    })}</div>
   </div> : null}
  </details>
 </>;
}
