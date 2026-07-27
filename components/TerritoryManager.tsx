"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { territoryMapPolygons, visibleTerritories, type TerritoryGeometry } from "@/lib/territoryMap";
import TerritoryBoundaryEditor from "@/components/TerritoryBoundaryEditor";

export type TerritoryManagerRecord = {
  id: string;
  name: string;
  description: string | null;
  territory_type: string;
  postal_codes: string[];
  neighborhoods: string[];
  boundary_geojson: TerritoryGeometry | null;
  is_active: boolean;
  color: string;
  notes: string | null;
  parent_territory_id: string | null;
  strategy_config: {
    cities?: string[];
    center?: { latitude: number; longitude: number };
    radius_meters?: number;
  };
  version: number;
  updated_at: string;
};

type MapInstance = {
  fitBounds: (bounds: unknown, padding?: number) => void;
  setCenter: (position: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
};
type PolygonInstance = { setMap: (map: MapInstance | null) => void; addListener: (event: string, listener: () => void) => void };
type CircleInstance = PolygonInstance & { getBounds: () => { getNorthEast: () => { lat: () => number; lng: () => number }; getSouthWest: () => { lat: () => number; lng: () => number } } | null };
type MapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Polygon: new (options: Record<string, unknown>) => PolygonInstance;
  Circle: new (options: Record<string, unknown>) => CircleInstance;
  LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void; isEmpty: () => boolean };
  Geocoder: new () => { geocode: (request: { address: string }, callback: (results: Array<{ geometry: { location: { lat: () => number; lng: () => number } } }> | null, status: string) => void) => void };
};
const browserMaps = () => (window as unknown as { google?: { maps?: MapsApi } }).google?.maps;

function loadMaps(apiKey: string): Promise<MapsApi> {
  return new Promise((resolve, reject) => {
    const ready = browserMaps();
    if (ready) return resolve(ready);
    const existing = document.querySelector<HTMLScriptElement>('script[src^="https://maps.googleapis.com/maps/api/js"]');
    const loaded = () => browserMaps() ? resolve(browserMaps()!) : reject(new Error("Google Maps did not initialize."));
    if (existing) {
      existing.addEventListener("load", loaded, { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps could not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.dataset.servonasTerritoryMap = "true";
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", () => reject(new Error("Google Maps could not load.")), { once: true });
    document.head.appendChild(script);
  });
}

function TerritoryFields({ territory, territories, apiKey }: { territory?: TerritoryManagerRecord; territories: TerritoryManagerRecord[]; apiKey?: string }) {
  const config=territory?.strategy_config??{};
  return <>
    <label>Name<input required name="name" maxLength={150} defaultValue={territory?.name ?? ""}/></label>
    <label>Color<input name="color" type="color" defaultValue={territory?.color ?? "#4F46E5"}/></label>
    <label>Strategy<select name="territoryType" defaultValue={territory?.territory_type ?? "mixed"}><option value="mixed">Mixed</option><option value="postal_codes">ZIP / postal codes</option><option value="neighborhoods">Neighborhoods</option><option value="polygon">Polygon boundary</option><option value="radius">Radius</option><option value="city_boundaries">City boundaries</option><option value="delivery_zone">Delivery zone</option><option value="service_area">Service area</option></select></label>
    <label>Parent territory<select name="parentTerritoryId" defaultValue={territory?.parent_territory_id ?? ""}><option value="">No parent</option>{territories.filter((item) => item.id !== territory?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label className="territory-field-wide">Description<textarea name="description" maxLength={2000} rows={2} defaultValue={territory?.description ?? ""}/></label>
    <label>ZIP / postal codes<textarea name="postalCodes" rows={3} placeholder="85234, 85296" defaultValue={territory?.postal_codes.join(", ") ?? ""}/></label>
    <label>Neighborhoods<textarea name="neighborhoods" rows={3} placeholder="Downtown, Northside" defaultValue={territory?.neighborhoods.join(", ") ?? ""}/></label>
    <label className="territory-field-wide">Cities<textarea name="cities" rows={2} placeholder="Gilbert, Chandler" defaultValue={config.cities?.join(", ")??""}/></label>
    <label>Radius latitude<input name="radiusLatitude" type="number" min="-90" max="90" step="any" defaultValue={config.center?.latitude??""}/></label>
    <label>Radius longitude<input name="radiusLongitude" type="number" min="-180" max="180" step="any" defaultValue={config.center?.longitude??""}/></label>
    <label className="territory-field-wide">Radius miles<input name="radiusMiles" type="number" min=".1" max="500" step=".1" defaultValue={config.radius_meters?Number((config.radius_meters/1609.344).toFixed(2)):""}/><small>Required only for the Radius strategy. Distances are saved in meters.</small></label>
    <div className="territory-field-wide"><span className="territory-field-label">Boundary</span><TerritoryBoundaryEditor apiKey={apiKey} name="boundaryGeojson" initialGeometry={territory?.boundary_geojson ?? null}/></div>
    <label className="territory-field-wide">Internal notes<textarea name="notes" maxLength={4000} rows={2} defaultValue={territory?.notes ?? ""}/></label>
  </>;
}

export default function TerritoryManager({
  apiKey, businessName, territories, canEdit, createAction, updateAction, statusAction,
}: {
  apiKey?: string;
  businessName: string;
  territories: TerritoryManagerRecord[];
  canEdit: boolean;
  createAction: (formData: FormData) => void | Promise<void>;
  updateAction: (formData: FormData) => void | Promise<void>;
  statusAction: (formData: FormData) => void | Promise<void>;
}) {
  const mapElement = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const polygons = useRef<PolygonInstance[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(territories.find((item) => item.is_active)?.id ?? territories[0]?.id ?? null);
  const [showInactive, setShowInactive] = useState(false);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [search, setSearch] = useState("");
  const [mapError, setMapError] = useState("");
  const [mapLoading, setMapLoading] = useState(Boolean(apiKey));
  const [creating, setCreating] = useState(false);
  const selected = territories.find((item) => item.id === selectedId) ?? null;
  const visible = useMemo(() => visibleTerritories(territories, showInactive), [territories, showInactive]);

  useEffect(() => {
    if (!apiKey || !mapElement.current) {
      if (!apiKey) setMapError("Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the interactive territory map.");
      setMapLoading(false);
      return;
    }
    let cancelled = false;
    loadMaps(apiKey).then((maps) => {
      if (cancelled || !mapElement.current) return;
      map.current = new maps.Map(mapElement.current, {
        center: { lat: 33.4484, lng: -112.074 },
        zoom: 9,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        gestureHandling: "greedy",
      });
      setMapLoading(false);
    }).catch((error: unknown) => {
      setMapLoading(false);
      setMapError(error instanceof Error ? error.message : "Google Maps could not load.");
    });
    return () => { cancelled = true; };
  }, [apiKey]);

  useEffect(() => {
    const maps = browserMaps();
    if (!maps || !map.current) return;
    polygons.current.forEach((polygon) => polygon.setMap(null));
    polygons.current = [];
    const bounds = new maps.LatLngBounds();
    if (showBoundaries) visible.forEach((territory) => {
      if (territory.territory_type==="radius"&&territory.strategy_config.center&&territory.strategy_config.radius_meters) {
        const circle=new maps.Circle({
          map:map.current,center:{lat:territory.strategy_config.center.latitude,lng:territory.strategy_config.center.longitude},
          radius:territory.strategy_config.radius_meters,strokeColor:territory.color,
          strokeOpacity:territory.is_active ? .95 : .45,strokeWeight:territory.id===selectedId?4:2,
          fillColor:territory.color,fillOpacity:territory.id===selectedId ? .28 : .14,clickable:true,
        });
        circle.addListener("click",()=>setSelectedId(territory.id));
        const circleBounds=circle.getBounds();
        if(circleBounds){
          const northEast=circleBounds.getNorthEast(),southWest=circleBounds.getSouthWest();
          bounds.extend({lat:northEast.lat(),lng:northEast.lng()});
          bounds.extend({lat:southWest.lat(),lng:southWest.lng()});
        }
        polygons.current.push(circle);
      }
      if (!territory.boundary_geojson) return;
      territoryMapPolygons(territory.boundary_geojson).forEach((paths) => {
        paths.flat().forEach((point) => bounds.extend(point));
        const polygon = new maps.Polygon({
          paths,
          map: map.current,
          strokeColor: territory.color,
          strokeOpacity: territory.is_active ? .95 : .45,
          strokeWeight: territory.id === selectedId ? 4 : 2,
          fillColor: territory.color,
          fillOpacity: territory.id === selectedId ? .28 : .14,
          clickable: true,
        });
        polygon.addListener("click", () => setSelectedId(territory.id));
        polygons.current.push(polygon);
      });
    });
    if (!bounds.isEmpty()) map.current.fitBounds(bounds, 70);
  }, [visible, showBoundaries, selectedId, mapLoading]);

  const locate = () => {
    const maps = browserMaps();
    if (!maps || !map.current || !search.trim()) return;
    new maps.Geocoder().geocode({ address: search.trim() }, (results, status) => {
      const location = results?.[0]?.geometry.location;
      if (status !== "OK" || !location) return setMapError("That address could not be located.");
      setMapError("");
      map.current?.setCenter({ lat: location.lat(), lng: location.lng() });
      map.current?.setZoom(14);
    });
  };

  return <div className="territory-manager">
    <header className="territory-header"><div><span className="sv-kicker">Territory intelligence</span><h1>Territory manager</h1><p>Design and maintain the operating areas for {businessName}.</p></div>{canEdit && <button className="sv-button" type="button" onClick={() => setCreating((value) => !value)}>{creating ? "Close" : "New territory"}</button>}</header>
    <div className="territory-toolbar">
      <form onSubmit={(event) => { event.preventDefault(); locate(); }}><label className="sr-only" htmlFor="territory-search">Search an address</label><input id="territory-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search an address or place"/><button type="submit">Search</button></form>
      <label><input type="checkbox" checked={showBoundaries} onChange={(event) => setShowBoundaries(event.target.checked)}/> Territory boundaries</label>
      <label><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)}/> Archived territories</label>
    </div>
    {mapError && <div className="workspace-notice error">{mapError}</div>}
    {creating && canEdit && <section className="territory-create-panel"><div><h2>Create territory</h2><p>Start simply with a name, then draw a boundary or add ZIP codes when ready.</p></div><form action={createAction}><TerritoryFields territories={territories} apiKey={apiKey}/><button className="sv-button">Create territory</button></form></section>}
    <div className="territory-workspace">
      <aside className="territory-list" aria-label="Territories"><header><strong>{visible.length} territories</strong><span>{visible.filter((item) => item.is_active).length} active</span></header>{visible.length ? visible.map((territory) => <button className={territory.id === selectedId ? "selected" : ""} type="button" key={territory.id} onClick={() => setSelectedId(territory.id)}><i style={{ background: territory.color }}/><span><strong>{territory.name}</strong><small>{territory.territory_type.replaceAll("_", " ")} · {territory.is_active ? "Active" : "Archived"}</small></span><b>›</b></button>) : <div className="territory-empty"><strong>No territories yet</strong><p>Create your first operating area to get started.</p></div>}</aside>
      <section className="territory-map-panel"><div ref={mapElement} className="territory-map" aria-label="Interactive territory map"/>{mapLoading && <div className="territory-map-state">Loading territory map…</div>}{!apiKey && <div className="territory-map-state">Map configuration required</div>}</section>
      <aside className="territory-inspector">{selected ? <><header><i style={{ background: selected.color }}/><div><span>{selected.is_active ? "Active territory" : "Archived territory"}</span><h2>{selected.name}</h2></div></header>{canEdit ? <form key={`${selected.id}-${selected.version}`} action={updateAction}><input type="hidden" name="territoryId" value={selected.id}/><input type="hidden" name="version" value={selected.version}/><TerritoryFields territory={selected} territories={territories} apiKey={apiKey}/><button className="sv-button">Save changes</button></form> : <div className="territory-readonly"><p>{selected.description || "No description."}</p><strong>{selected.postal_codes.length} postal codes</strong><strong>{selected.neighborhoods.length} neighborhoods</strong></div>}{canEdit && <form className="territory-archive" action={statusAction}><input type="hidden" name="territoryId" value={selected.id}/><input type="hidden" name="active" value={String(!selected.is_active)}/><button type="submit">{selected.is_active ? "Archive territory" : "Restore territory"}</button><small>Archived territories remain in audit history.</small></form>}<footer>Version {selected.version} · updated {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(selected.updated_at))}</footer></> : <div className="territory-empty"><strong>Select a territory</strong><p>Details and editing controls will appear here.</p></div>}</aside>
    </div>
  </div>;
}
