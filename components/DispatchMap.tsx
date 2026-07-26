"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteWarning } from "@/lib/routing/warnings";
import { moveStop } from "@/lib/routing/reordering";
import { requireGoogleMapsLibrary } from "@/lib/googleMapsLibrary";

export type DispatchMapJob = {
  id: string;
  jobNumber: number;
  title: string;
  status: string;
  scheduledLabel: string;
  arrivalWindow: string | null;
  customerName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodingStatus: string | null;
  technicianId: string | null;
  technicianName: string | null;
  technicianColor: string | null;
  sequence: number | null;
  estimatedArrivalLabel: string | null;
  drivingDistanceMeters: number | null;
  drivingDurationSeconds: number | null;
  isLocked: boolean;
  href: string;
  hasConflict: boolean;
};

export type DispatchMapRoute = {
  technicianRouteId: string | null;
  technicianId: string;
  technicianName: string;
  technicianStatus: string;
  color: string;
  encodedPolyline: string | null;
  encodedPolylines: string[];
  stopCount: number;
  calculationStatus: string;
  originLabel: string;
  destinationLabel: string;
  drivingDistanceMeters: number | null;
  drivingDurationSeconds: number | null;
  errorCode: string | null;
  calculatedAt: string | null;
};

type MapsObject = {
  importLibrary?: (name: string) => Promise<unknown>;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => {
    fitBounds: (bounds: unknown, padding?: number) => void;
    setCenter: (center: { lat: number; lng: number }) => void;
    setZoom: (zoom: number) => void;
  };
  Marker: new (options: Record<string, unknown>) => {
    addListener: (event: string, callback: () => void) => void;
    setMap: (map: null) => void;
  };
  InfoWindow: new () => {
    setContent: (content: string) => void;
    open: (options: Record<string, unknown>) => void;
  };
  Polyline: new (options: Record<string, unknown>) => {
    addListener: (event: string, callback: () => void) => void;
    setMap: (map: null) => void;
  };
  LatLngBounds: new () => {
    extend: (point: { lat: number; lng: number }) => void;
    isEmpty: () => boolean;
  };
  geometry?: {
    encoding?: {
      decodePath: (value: string) => Array<{ lat: () => number; lng: () => number }>;
    };
  };
};

declare global {
  interface Window {
    google?: { maps?: MapsObject };
  }
}

const requireGeometry = (maps: MapsObject) =>
  requireGoogleMapsLibrary(maps, "geometry", (value) => Boolean(value.geometry?.encoding));

function loadGoogleMaps(apiKey: string): Promise<MapsObject> {
  return new Promise((resolve, reject) => {
    const ready = window.google?.maps;
    if (ready) {
      requireGeometry(ready).then(resolve, reject);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[src^="https://maps.googleapis.com/maps/api/js"]');
    const onLoad = () => window.google?.maps
      ? requireGeometry(window.google.maps).then(resolve, reject)
      : reject(new Error("Google Maps did not initialize."));
    if (existing) {
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps could not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
    script.async = true;
    script.defer = true;
    script.dataset.servonasDispatchMap = "true";
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", () => reject(new Error("Google Maps could not load.")), { once: true });
    document.head.appendChild(script);
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function distanceLabel(meters: number | null): string {
  return meters === null ? "Route pending" : `${(meters / 1609.344).toFixed(1)} driving miles`;
}

function durationLabel(seconds: number | null): string {
  return seconds === null ? "Drive time pending" : `${Math.max(1, Math.round(seconds / 60))}-minute drive`;
}

export default function DispatchMap({
  apiKey,
  jobs,
  routes,
  warnings,
  date,
  canReorder,
  reorderAction,
  planVersion,
  calculationRevision,
  planUpdatedAt,
}: {
  apiKey?: string;
  jobs: DispatchMapJob[];
  routes: DispatchMapRoute[];
  warnings: RouteWarning[];
  date: string;
  canReorder: boolean;
  reorderAction: (formData: FormData) => void | Promise<void>;
  planVersion: number | null;
  calculationRevision: number | null;
  planUpdatedAt: string | null;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<InstanceType<MapsObject["Map"]> | null>(null);
  const markerByJob = useRef(new Map<string, InstanceType<MapsObject["Marker"]>>());
  const infoWindow = useRef<InstanceType<MapsObject["InfoWindow"]> | null>(null);
  const fitVisible = useRef<(() => void) | null>(null);
  const [mapError, setMapError] = useState("");
  const [loading, setLoading] = useState(Boolean(apiKey));
  const [technician, setTechnician] = useState("all");
  const [status, setStatus] = useState("all");
  const [assignment, setAssignment] = useState("all");
  const [issue, setIssue] = useState("all");
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(true);
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [mapRevision, setMapRevision] = useState(0);
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(() => new Set());
  const [draftOrders, setDraftOrders] = useState<Record<string, string[]>>({});
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null);

  const technicians = useMemo(
    () =>
      routes
        .map((route) => ({ id: route.technicianId, name: route.technicianName, color: route.color }))
        .filter((value, index, values) => values.findIndex((candidate) => candidate.id === value.id) === index),
    [routes],
  );
  const visibleJobs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (technician !== "all" && job.technicianId !== technician) return false;
      if (status !== "all" && job.status !== status) return false;
      if (assignment === "assigned" && !job.technicianId) return false;
      if (assignment === "unassigned" && job.technicianId) return false;
      if (issue === "unmappable" && job.latitude !== null && job.longitude !== null) return false;
      if (issue === "conflict" && !job.hasConflict) return false;
      if (issue === "risk" && !warnings.some((warning) => warning.jobId === job.id)) return false;
      if (!showCompleted && job.status === "completed") return false;
      if (!showUnassigned && !job.technicianId) return false;
      return !needle || [job.title, job.customerName, job.address, String(job.jobNumber)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [assignment, issue, jobs, search, showCompleted, showUnassigned, status, technician, warnings]);
  const visibleRoutes = useMemo(
    () => routes.filter((route) => technician === "all" || route.technicianId === technician),
    [routes, technician],
  );

  useEffect(() => {
    if (!apiKey || !mapElement.current) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const markerIndex = markerByJob.current;
    const markers: Array<InstanceType<MapsObject["Marker"]>> = [];
    const polylines: Array<InstanceType<MapsObject["Polyline"]>> = [];
    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !mapElement.current) return;
        const map = new maps.Map(mapElement.current, {
          center: { lat: 33.4484, lng: -112.074 },
          zoom: 9,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        mapInstance.current = map;
        const bounds = new maps.LatLngBounds();
        const info = new maps.InfoWindow();
        infoWindow.current = info;
        markerIndex.clear();
        for (const route of visibleRoutes) {
          if (!showLines) continue;
          const geometries = route.encodedPolyline ? [route.encodedPolyline] : route.encodedPolylines;
          for (const geometry of geometries) {
            const path = maps.geometry!.encoding!.decodePath(geometry);
            path.forEach((point) => bounds.extend({ lat: point.lat(), lng: point.lng() }));
            const polyline = new maps.Polyline({
              map,
              path,
              strokeColor: route.color,
              strokeOpacity: technician === "all" ? 0.78 : 0.95,
              strokeWeight: technician === "all" ? 5 : 7,
            });
            polyline.addListener("click", () => {
              setTechnician(route.technicianId);
            });
            polylines.push(polyline);
          }
        }
        for (const job of visibleJobs) {
          if (job.latitude === null || job.longitude === null) continue;
          const position = { lat: job.latitude, lng: job.longitude };
          bounds.extend(position);
          const color = job.technicianColor ?? "#64748b";
          const marker = new maps.Marker({
            map,
            position,
            title: `${job.sequence ? `Stop ${job.sequence}: ` : ""}${job.title}`,
            label: showLabels
              ? { text: job.sequence ? String(job.sequence) : "U", color: "#ffffff", fontWeight: "800" }
              : undefined,
            icon: {
              path: "M 0,0 C -2,-10 -10,-12 -10,-22 A 10,10 0 1,1 10,-22 C 10,-12 2,-10 0,0 z",
              fillColor: color,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
              scale: 1.25,
              labelOrigin: { x: 0, y: -22 },
            },
          });
          marker.addListener("click", () => {
            setSelectedJobId(job.id);
          });
          markerIndex.set(job.id, marker);
          markers.push(marker);
        }
        fitVisible.current = () => {
          if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
        };
        fitVisible.current();
        setMapRevision((value) => value + 1);
        setMapError("");
      })
      .catch((error) => setMapError(error instanceof Error ? error.message : "The map could not load."))
      .finally(() => setLoading(false));
    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.setMap(null));
      polylines.forEach((polyline) => polyline.setMap(null));
      markerIndex.clear();
      infoWindow.current = null;
      fitVisible.current = null;
    };
  }, [apiKey, showLabels, showLines, technician, visibleJobs, visibleRoutes]);

  useEffect(() => {
    if (!selectedJobId) return;
    const job = jobs.find((candidate) => candidate.id === selectedJobId);
    const marker = markerByJob.current.get(selectedJobId);
    const map = mapInstance.current;
    const info = infoWindow.current;
    if (!job || !marker || !map || !info || job.latitude === null || job.longitude === null) return;
    map.setCenter({ lat: job.latitude, lng: job.longitude });
    map.setZoom(14);
    const jobWarnings = warnings.filter((warning) => warning.jobId === job.id);
    info.setContent(`<div class="dispatch-map-info"><strong>${escapeHtml(job.sequence ? `Stop ${job.sequence} · ${job.title}` : job.title)}</strong><span>${escapeHtml(job.customerName)}</span><span>${escapeHtml(job.address ?? "Address unavailable")}</span><span>${escapeHtml(job.scheduledLabel)} · ${escapeHtml(job.status.replaceAll("_", " "))}</span>${job.arrivalWindow ? `<span>Arrival window: ${escapeHtml(job.arrivalWindow)}</span>` : ""}${job.estimatedArrivalLabel ? `<span>Estimated arrival: ${escapeHtml(job.estimatedArrivalLabel)}</span>` : ""}${job.drivingDistanceMeters !== null ? `<span>${escapeHtml(distanceLabel(job.drivingDistanceMeters))} · ${escapeHtml(durationLabel(job.drivingDurationSeconds))}</span>` : ""}${jobWarnings.map((warning) => `<span class="dispatch-info-warning ${warning.severity}"><b>${escapeHtml(warning.severity)}</b> · ${escapeHtml(warning.title)}</span>`).join("")}<a href="${escapeHtml(job.href)}">Open job</a></div>`);
    info.open({ map, anchor: marker });
  }, [jobs, mapRevision, selectedJobId, warnings]);

  const mappedCount = visibleJobs.filter((job) => job.latitude !== null && job.longitude !== null).length;
  const routeReady = visibleRoutes.some((route) => route.encodedPolyline || route.encodedPolylines.length);

  return (
    <section className={`dispatch-map-workspace ${fullScreen ? "is-fullscreen" : ""}`} aria-labelledby="dispatch-map-title">
      <header className="dispatch-map-header">
        <div>
          <small>Daily route workspace</small>
          <h2 id="dispatch-map-title">Dispatch map</h2>
          <p>{mappedCount} mapped · {warnings.filter((warning) => warning.severity === "critical").length} critical · {warnings.filter((warning) => warning.severity === "warning").length} warnings</p>
          {planVersion !== null && <small className="dispatch-plan-revision">Plan v{planVersion} · Calculation {calculationRevision ?? 0} · Updated {planUpdatedAt ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(planUpdatedAt)) : "unknown"}</small>}
        </div>
        <div className="dispatch-map-buttons">
          <button type="button" className="sv-button sv-secondary" onClick={() => fitVisible.current?.()}>Fit visible</button>
          <button type="button" className="sv-button sv-secondary" onClick={() => setFullScreen((value) => !value)}>{fullScreen ? "Exit full screen" : "Full screen"}</button>
        </div>
      </header>
      <p className="sr-only" aria-live="polite">{Object.keys(draftOrders).length ? "Route order changed. Review and save the affected technician route." : "Route order matches the saved plan."}</p>
      <div className="dispatch-map-filters" aria-label="Dispatch map filters">
        <label>Technician<select value={technician} onChange={(event) => setTechnician(event.target.value)}><option value="all">All technicians</option>{technicians.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{[...new Set(jobs.map((job) => job.status))].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        <label>Assignment<select value={assignment} onChange={(event) => setAssignment(event.target.value)}><option value="all">Assigned and unassigned</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select></label>
        <label>Route issue<select value={issue} onChange={(event) => setIssue(event.target.value)}><option value="all">All jobs</option><option value="risk">Any route risk</option><option value="unmappable">Missing coordinates</option><option value="conflict">Schedule conflict</option></select></label>
        <label className="dispatch-map-search">Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, job, or address"/></label>
      </div>
      <div className="dispatch-map-layout">
        <aside className="dispatch-map-legend" aria-label="Technician routes">
          <button type="button" className={technician === "all" ? "selected" : ""} onClick={() => setTechnician("all")}><span className="dispatch-route-symbol all">A</span><span><strong>All routes</strong><small>{jobs.length} scheduled jobs</small></span></button>
          <div className="dispatch-route-panels">
            {routes.map((route) => {
              const persistedRouteJobs = jobs.filter((job) => job.technicianId === route.technicianId).sort((left,right) => (left.sequence ?? 999)-(right.sequence ?? 999));
              const order = draftOrders[route.technicianId] ?? persistedRouteJobs.map((job) => job.id);
              const routeJobs = order.flatMap((jobId) => {
                const job = persistedRouteJobs.find((candidate) => candidate.id === jobId);
                return job ? [job] : [];
              });
              const orderChanged = order.some((jobId, index) => jobId !== persistedRouteJobs[index]?.id);
              const expanded = expandedRoutes.has(route.technicianId);
              const routeWarnings = warnings.filter((warning) => warning.technicianId === route.technicianId);
              const warningCount = routeWarnings.filter((warning) => warning.severity !== "info").length;
              return <section key={route.technicianId} className={`dispatch-route-panel ${technician === route.technicianId ? "selected" : ""}`}>
                <button type="button" className="dispatch-route-summary" aria-expanded={expanded} onClick={() => {
                  setTechnician(route.technicianId);
                  setExpandedRoutes((current) => {
                    const next = new Set(current);
                    if (next.has(route.technicianId)) next.delete(route.technicianId); else next.add(route.technicianId);
                    return next;
                  });
                }}>
                  <span className="dispatch-route-symbol" style={{ background: route.color }}>{route.technicianName.slice(0,1)}</span>
                  <span><strong>{route.technicianName}</strong><small>{route.technicianStatus.replaceAll("_", " ")} · {route.stopCount} stops</small><small>{route.drivingDistanceMeters !== null ? distanceLabel(route.drivingDistanceMeters) : route.calculationStatus === "failed" ? `Route failed${route.errorCode ? ` · ${route.errorCode.replaceAll("_"," ")}` : ""}` : route.calculationStatus === "stale" ? "Route changed · recalculate" : route.calculationStatus === "calculating" ? "Route calculation in progress" : "Road route not calculated"}</small></span>
                  <span className="dispatch-route-expand">{warningCount > 0 && <b title={`${warningCount} route warnings`}>{warningCount}</b>}{expanded ? "−" : "+"}</span>
                </button>
                {expanded && <div className="dispatch-route-details">
                  <div className="dispatch-route-total"><span>{distanceLabel(route.drivingDistanceMeters)}</span><span>{durationLabel(route.drivingDurationSeconds)}</span></div>
                  <div className="dispatch-route-window"><span>Calculation: {route.calculationStatus.replaceAll("_"," ")}</span><span>{route.calculatedAt ? `Updated ${new Intl.DateTimeFormat("en-US",{dateStyle:"short",timeStyle:"short"}).format(new Date(route.calculatedAt))}` : "Never calculated"}</span></div>
                  <div className="dispatch-route-window"><span>First: {routeJobs[0]?.scheduledLabel ?? "No stops"}</span><span>Last: {routeJobs.at(-1)?.scheduledLabel ?? "No stops"}</span></div>
                  <div className="dispatch-route-endpoint"><b>Start</b><span>{route.originLabel}</span></div>
                  {routeWarnings.length > 0 && <div className="dispatch-route-risks" aria-label={`${route.technicianName} route warnings`}>{routeWarnings.map((warning) => <div key={warning.id} className={warning.severity}><b>{warning.severity}</b><span><strong>{warning.title}</strong><small>{warning.message}</small></span></div>)}</div>}
                  <ol>
                    {routeJobs.map((job, index) => <li key={job.id} className={selectedJobId === job.id ? "selected" : ""} draggable={canReorder && !job.isLocked && job.status !== "completed"} onDragStart={() => setDraggedJobId(job.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => {
                      if (!draggedJobId || draggedJobId === job.id) return;
                      const from = routeJobs.findIndex((candidate) => candidate.id === draggedJobId);
                      const to = routeJobs.findIndex((candidate) => candidate.id === job.id);
                      if (from < 0 || to < 0) return;
                      let next = routeJobs.map((candidate) => ({ id: candidate.id, isLocked: candidate.isLocked, status: candidate.status }));
                      const direction = from < to ? 1 : -1;
                      while (from < to ? next.findIndex((candidate) => candidate.id === draggedJobId) < to : next.findIndex((candidate) => candidate.id === draggedJobId) > to) {
                        const current = next.findIndex((candidate) => candidate.id === draggedJobId);
                        const moved = moveStop(next, current, direction);
                        if (moved === next) break;
                        next = moved;
                      }
                      setDraftOrders((current) => ({ ...current, [route.technicianId]: next.map((candidate) => candidate.id) }));
                      setDraggedJobId(null);
                    }}>
                      <button type="button" onClick={() => setSelectedJobId(job.id)} disabled={job.latitude === null} aria-label={`Focus stop ${job.sequence}, ${job.title}, on map`}>
                        <span className="dispatch-stop-number">{index + 1}</span>
                        <span className="dispatch-stop-copy"><strong>{job.scheduledLabel} · {job.title}</strong><small>{job.customerName}</small><small>{job.address || "No service address"}</small><small>{job.drivingDistanceMeters === null ? "Drive calculation pending" : `${distanceLabel(job.drivingDistanceMeters)} · ${durationLabel(job.drivingDurationSeconds)}`}</small>{job.estimatedArrivalLabel && <small>ETA {job.estimatedArrivalLabel}</small>}</span>
                        <span className="dispatch-stop-icons">{job.isLocked && <b title="Stop position locked">L</b>}{job.hasConflict && <b className="warning" title="Schedule conflict">!</b>}{job.latitude === null && <b className="warning" title="Address cannot be mapped">?</b>}</span>
                      </button>
                      <div className="dispatch-stop-actions"><a href={job.href}>Open job</a>{canReorder && <><button type="button" disabled={index === 0 || job.isLocked || job.status === "completed"} onClick={() => {
                        const next = moveStop(routeJobs.map((candidate) => ({ id: candidate.id, isLocked: candidate.isLocked, status: candidate.status })), index, -1);
                        setDraftOrders((current) => ({ ...current, [route.technicianId]: next.map((candidate) => candidate.id) }));
                      }} aria-label={`Move ${job.title} up one stop`}>↑ Up</button><button type="button" disabled={index === routeJobs.length - 1 || job.isLocked || job.status === "completed"} onClick={() => {
                        const next = moveStop(routeJobs.map((candidate) => ({ id: candidate.id, isLocked: candidate.isLocked, status: candidate.status })), index, 1);
                        setDraftOrders((current) => ({ ...current, [route.technicianId]: next.map((candidate) => candidate.id) }));
                      }} aria-label={`Move ${job.title} down one stop`}>↓ Down</button></>}</div>
                    </li>)}
                  </ol>
                  {canReorder && route.technicianRouteId && orderChanged && <form action={reorderAction} className="dispatch-reorder-preview">
                    <input type="hidden" name="date" value={date}/>
                    <input type="hidden" name="technicianRouteId" value={route.technicianRouteId}/>
                    <input type="hidden" name="technicianId" value={route.technicianId}/>
                    <input type="hidden" name="planVersion" value={planVersion ?? ""}/>
                    <input type="hidden" name="orderedJobIds" value={JSON.stringify(order)}/>
                    <strong>Preview new stop order?</strong>
                    <p>The affected route will be recalculated using actual driving roads. No savings are estimated until calculation finishes.</p>
                    {routeJobs.some((job) => ["en_route","arrived","in_progress"].includes(job.status)) && <label><input type="checkbox" name="confirmActive" value="yes" required/> I confirm this changes an active route.</label>}
                    <div><button type="button" className="text-button" onClick={() => setDraftOrders((current) => {
                      const next = { ...current }; delete next[route.technicianId]; return next;
                    })}>Cancel</button><button className="sv-button" type="submit">Save and recalculate</button></div>
                  </form>}
                  <div className="dispatch-route-endpoint"><b>End</b><span>{route.destinationLabel}</span></div>
                </div>}
              </section>;
            })}
          </div>
          <div className="dispatch-map-toggles">
            <label><input type="checkbox" checked={showCompleted} onChange={(event) => setShowCompleted(event.target.checked)}/> Completed stops</label>
            <label><input type="checkbox" checked={showUnassigned} onChange={(event) => setShowUnassigned(event.target.checked)}/> Unassigned jobs</label>
            <label><input type="checkbox" checked={showLines} onChange={(event) => setShowLines(event.target.checked)}/> Route lines</label>
            <label><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)}/> Stop labels</label>
          </div>
          {!routeReady && routes.length > 0 && <div className="dispatch-map-note">Road routes are not calculated yet. Scheduled stops are shown without route lines or driving metrics.</div>}
        </aside>
        <div className="dispatch-map-canvas-wrap">
          {!apiKey ? <div className="dispatch-map-state"><strong>Map is not configured</strong><p>Add the browser-restricted Google Maps key to display verified stops. The dispatch list remains available below.</p></div>
            : loading ? <div className="dispatch-map-state" role="status"><span className="dispatch-map-spinner"/><strong>Loading dispatch map…</strong></div>
              : mapError ? <div className="dispatch-map-state error" role="alert"><strong>Map unavailable</strong><p>{mapError} Use the dispatch list below while the provider is unavailable.</p></div>
                : visibleJobs.length === 0 ? <div className="dispatch-map-state"><strong>No scheduled work</strong><p>No jobs match the selected filters.</p></div>
                  : mappedCount === 0 ? <div className="dispatch-map-state"><strong>No routable locations</strong><p>The scheduled jobs need verified service-location coordinates.</p></div> : null}
          <div ref={mapElement} className="dispatch-map-canvas" aria-label="Map of scheduled service jobs"/>
        </div>
      </div>
      {warnings.length > 0 && <div className="dispatch-map-warnings" aria-labelledby="route-risk-title"><h3 id="route-risk-title">Route warnings</h3><div>{warnings.map((warning) => {
        const job = warning.jobId ? jobs.find((candidate) => candidate.id === warning.jobId) : null;
        const content = <><strong><span className={`dispatch-warning-severity ${warning.severity}`}>{warning.severity}</span>{warning.title}</strong><span>{warning.message}</span></>;
        return job ? <a href={job.href} key={warning.id}>{content}</a> : <article className={warning.severity} key={warning.id}>{content}</article>;
      })}</div></div>}
    </section>
  );
}
