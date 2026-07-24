"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  technicianId: string;
  technicianName: string;
  technicianStatus: string;
  color: string;
  encodedPolyline: string | null;
  stopCount: number;
  calculationStatus: string;
  originLabel: string;
  destinationLabel: string;
  drivingDistanceMeters: number | null;
  drivingDurationSeconds: number | null;
};

type MapsObject = {
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

function loadGoogleMaps(apiKey: string): Promise<MapsObject> {
  return new Promise((resolve, reject) => {
    const ready = window.google?.maps;
    if (ready) {
      resolve(ready);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-servonas-dispatch-map="true"]');
    const onLoad = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error("Google Maps did not initialize."));
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
}: {
  apiKey?: string;
  jobs: DispatchMapJob[];
  routes: DispatchMapRoute[];
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
      if (!showCompleted && job.status === "completed") return false;
      if (!showUnassigned && !job.technicianId) return false;
      return !needle || [job.title, job.customerName, job.address, String(job.jobNumber)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [assignment, issue, jobs, search, showCompleted, showUnassigned, status, technician]);
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
          if (!showLines || !route.encodedPolyline || !maps.geometry?.encoding) continue;
          const path = maps.geometry.encoding.decodePath(route.encodedPolyline);
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
    info.setContent(`<div class="dispatch-map-info"><strong>${escapeHtml(job.sequence ? `Stop ${job.sequence} · ${job.title}` : job.title)}</strong><span>${escapeHtml(job.customerName)}</span><span>${escapeHtml(job.address ?? "Address unavailable")}</span><span>${escapeHtml(job.scheduledLabel)} · ${escapeHtml(job.status.replaceAll("_", " "))}</span>${job.arrivalWindow ? `<span>Arrival window: ${escapeHtml(job.arrivalWindow)}</span>` : ""}${job.estimatedArrivalLabel ? `<span>Estimated arrival: ${escapeHtml(job.estimatedArrivalLabel)}</span>` : ""}${job.drivingDistanceMeters !== null ? `<span>${escapeHtml(distanceLabel(job.drivingDistanceMeters))} · ${escapeHtml(durationLabel(job.drivingDurationSeconds))}</span>` : ""}<a href="${escapeHtml(job.href)}">Open job</a></div>`);
    info.open({ map, anchor: marker });
  }, [jobs, mapRevision, selectedJobId]);

  const mappedCount = visibleJobs.filter((job) => job.latitude !== null && job.longitude !== null).length;
  const missingJobs = visibleJobs.filter((job) => job.latitude === null || job.longitude === null);
  const routeReady = visibleRoutes.some((route) => route.encodedPolyline);

  return (
    <section className={`dispatch-map-workspace ${fullScreen ? "is-fullscreen" : ""}`} aria-labelledby="dispatch-map-title">
      <header className="dispatch-map-header">
        <div>
          <small>Daily route workspace</small>
          <h2 id="dispatch-map-title">Dispatch map</h2>
          <p>{mappedCount} mapped · {missingJobs.length} need address attention</p>
        </div>
        <div className="dispatch-map-buttons">
          <button type="button" className="sv-button sv-secondary" onClick={() => fitVisible.current?.()}>Fit visible</button>
          <button type="button" className="sv-button sv-secondary" onClick={() => setFullScreen((value) => !value)}>{fullScreen ? "Exit full screen" : "Full screen"}</button>
        </div>
      </header>
      <div className="dispatch-map-filters" aria-label="Dispatch map filters">
        <label>Technician<select value={technician} onChange={(event) => setTechnician(event.target.value)}><option value="all">All technicians</option>{technicians.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{[...new Set(jobs.map((job) => job.status))].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        <label>Assignment<select value={assignment} onChange={(event) => setAssignment(event.target.value)}><option value="all">Assigned and unassigned</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select></label>
        <label>Route issue<select value={issue} onChange={(event) => setIssue(event.target.value)}><option value="all">All jobs</option><option value="unmappable">Missing coordinates</option><option value="conflict">Schedule conflict</option></select></label>
        <label className="dispatch-map-search">Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, job, or address"/></label>
      </div>
      <div className="dispatch-map-layout">
        <aside className="dispatch-map-legend" aria-label="Technician routes">
          <button type="button" className={technician === "all" ? "selected" : ""} onClick={() => setTechnician("all")}><span className="dispatch-route-symbol all">A</span><span><strong>All routes</strong><small>{jobs.length} scheduled jobs</small></span></button>
          <div className="dispatch-route-panels">
            {routes.map((route) => {
              const routeJobs = jobs.filter((job) => job.technicianId === route.technicianId).sort((left,right) => (left.sequence ?? 999)-(right.sequence ?? 999));
              const expanded = expandedRoutes.has(route.technicianId);
              const warningCount = routeJobs.filter((job) => job.hasConflict || job.latitude === null).length + (["partial","failed","stale"].includes(route.calculationStatus) ? 1 : 0);
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
                  <span><strong>{route.technicianName}</strong><small>{route.technicianStatus.replaceAll("_", " ")} · {route.stopCount} stops</small><small>{distanceLabel(route.drivingDistanceMeters)}</small></span>
                  <span className="dispatch-route-expand">{warningCount > 0 && <b title={`${warningCount} route warnings`}>{warningCount}</b>}{expanded ? "−" : "+"}</span>
                </button>
                {expanded && <div className="dispatch-route-details">
                  <div className="dispatch-route-total"><span>{distanceLabel(route.drivingDistanceMeters)}</span><span>{durationLabel(route.drivingDurationSeconds)}</span></div>
                  <div className="dispatch-route-window"><span>First: {routeJobs[0]?.scheduledLabel ?? "No stops"}</span><span>Last: {routeJobs.at(-1)?.scheduledLabel ?? "No stops"}</span></div>
                  <div className="dispatch-route-endpoint"><b>Start</b><span>{route.originLabel}</span></div>
                  <ol>
                    {routeJobs.map((job) => <li key={job.id} className={selectedJobId === job.id ? "selected" : ""}>
                      <button type="button" onClick={() => setSelectedJobId(job.id)} disabled={job.latitude === null} aria-label={`Focus stop ${job.sequence}, ${job.title}, on map`}>
                        <span className="dispatch-stop-number">{job.sequence}</span>
                        <span className="dispatch-stop-copy"><strong>{job.scheduledLabel} · {job.title}</strong><small>{job.customerName}</small><small>{job.address || "No service address"}</small><small>{job.drivingDistanceMeters === null ? "Drive calculation pending" : `${distanceLabel(job.drivingDistanceMeters)} · ${durationLabel(job.drivingDurationSeconds)}`}</small>{job.estimatedArrivalLabel && <small>ETA {job.estimatedArrivalLabel}</small>}</span>
                        <span className="dispatch-stop-icons">{job.isLocked && <b title="Stop position locked">L</b>}{job.hasConflict && <b className="warning" title="Schedule conflict">!</b>}{job.latitude === null && <b className="warning" title="Address cannot be mapped">?</b>}</span>
                      </button>
                      <a href={job.href}>Open job</a>
                    </li>)}
                  </ol>
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
      {missingJobs.length > 0 && <div className="dispatch-map-warnings"><h3>Locations needing attention</h3><div>{missingJobs.map((job) => <a href={job.href} key={job.id}><strong>#{job.jobNumber} · {job.title}</strong><span>{job.address || "No service address"} · {job.geocodingStatus?.replaceAll("_", " ") || "not verified"}</span></a>)}</div></div>}
    </section>
  );
}
