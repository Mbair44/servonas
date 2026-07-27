"use client";

import { useEffect, useRef, useState } from "react";
import { validateTerritoryGeometry, type TerritoryGeometry } from "@/lib/territoryMap";

type Point = { lat: () => number; lng: () => number };
type Path = {
  getArray: () => Point[];
  getLength: () => number;
  removeAt: (index: number) => void;
  addListener: (event: string, callback: () => void) => void;
};
type Polygon = {
  setMap: (map: Map | null) => void;
  setEditable: (editable: boolean) => void;
  setPath: (path: Array<{ lat: number; lng: number }>) => void;
  getPath: () => Path;
  addListener: (event: string, callback: (event?: { vertex?: number }) => void) => void;
};
type Map = {
  fitBounds: (bounds: unknown, padding?: number) => void;
  addListener: (event: string, callback: (event: { latLng?: Point }) => void) => void;
  setOptions: (options: Record<string, unknown>) => void;
};
type Maps = {
  Map: new (node: HTMLElement, options: Record<string, unknown>) => Map;
  Polygon: new (options: Record<string, unknown>) => Polygon;
  LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void; isEmpty: () => boolean };
};
const mapsApi = () => (window as unknown as { google?: { maps?: Maps } }).google?.maps;

async function loadMaps(apiKey: string) {
  const current = mapsApi();
  if (current) return current;
  return new Promise<Maps>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src^="https://maps.googleapis.com/maps/api/js"]');
    if (existing) {
      existing.addEventListener("load", () => mapsApi() ? resolve(mapsApi()!) : reject(new Error("Google Maps did not initialize.")), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps could not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => mapsApi() ? resolve(mapsApi()!) : reject(new Error("Google Maps did not initialize.")), { once: true });
    script.addEventListener("error", () => reject(new Error("Google Maps could not load.")), { once: true });
    document.head.appendChild(script);
  });
}

type PolygonCoordinates = number[][][];
const geometryParts = (geometry: TerritoryGeometry | null): PolygonCoordinates[] => {
  if (!geometry) return [];
  return geometry.type === "Polygon"
    ? [geometry.coordinates as PolygonCoordinates]
    : geometry.coordinates as PolygonCoordinates[];
};
const geometryFromParts = (parts: PolygonCoordinates[]): TerritoryGeometry | null => {
  if (!parts.length) return null;
  return parts.length === 1
    ? { type: "Polygon", coordinates: parts[0] }
    : { type: "MultiPolygon", coordinates: parts };
};
const closedRing = (path: Point[]) => {
  const coordinates = path.map((point) => [point.lng(), point.lat()]);
  if (coordinates.length && (coordinates[0][0] !== coordinates.at(-1)?.[0] || coordinates[0][1] !== coordinates.at(-1)?.[1])) {
    coordinates.push([...coordinates[0]]);
  }
  return coordinates;
};

export default function TerritoryBoundaryEditor({
  apiKey, name, initialGeometry,
}: {
  apiKey?: string;
  name: string;
  initialGeometry: TerritoryGeometry | null;
}) {
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const overlays = useRef<Polygon[]>([]);
  const drawingActive = useRef(false);
  const drawingPoints = useRef<Array<{ lat: number; lng: number }>>([]);
  const drawingPreview = useRef<Polygon | null>(null);
  const geometryBeforeDrawing = useRef<TerritoryGeometry | null>(initialGeometry);
  const wireOverlayRef = useRef<(overlay: Polygon, index: number) => void>(() => {});
  const selectedIndex = useRef<number | null>(null);
  const history = useRef<(TerritoryGeometry | null)[]>([initialGeometry]);
  const historyIndex = useRef(0);
  const suppressHistory = useRef(false);
  const [geometry, setGeometry] = useState<TerritoryGeometry | null>(initialGeometry);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("Draw a polygon or click a boundary to edit its vertices.");
  const [isDrawing, setIsDrawing] = useState(false);

  const capture = (next: TerritoryGeometry | null) => {
    const validation = validateTerritoryGeometry(next);
    setGeometry(next);
    setError(validation ?? "");
    if (suppressHistory.current) return;
    history.current = [...history.current.slice(0, historyIndex.current + 1), next];
    historyIndex.current = history.current.length - 1;
    setRevision((value) => value + 1);
  };

  const readOverlays = () => capture(geometryFromParts(overlays.current.map((overlay) => [closedRing(overlay.getPath().getArray())])));

  useEffect(() => {
    if (!apiKey || !node.current) {
      if (!apiKey) setError("Map drawing requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.");
      return;
    }
    let cancelled = false;
    loadMaps(apiKey).then((maps) => {
      if (cancelled || !node.current) return;
      map.current = new maps.Map(node.current, {
        center: { lat: 33.4484, lng: -112.074 }, zoom: 9, streetViewControl: false,
        mapTypeControl: false, fullscreenControl: true, gestureHandling: "greedy",
      });
      map.current.addListener("click", (event) => {
        if (!drawingActive.current || !event.latLng) return;
        drawingPoints.current.push({ lat: event.latLng.lat(), lng: event.latLng.lng() });
        if (!drawingPreview.current) {
          drawingPreview.current = new maps.Polygon({
            paths: drawingPoints.current, map: map.current, clickable: false,
            fillColor: "#4F46E5", fillOpacity: .15, strokeColor: "#4F46E5", strokeWeight: 3,
          });
        } else {
          drawingPreview.current.setPath(drawingPoints.current);
        }
        if (drawingPoints.current.length >= 3) {
          const coordinates=drawingPoints.current.map((point)=>[point.lng,point.lat]);
          coordinates.push([...coordinates[0]]);
          const draft=geometryFromParts([...geometryParts(geometryBeforeDrawing.current),[coordinates]]);
          setGeometry(draft);
          setError(validateTerritoryGeometry(draft)??"");
        }
        setHint(`${drawingPoints.current.length} vertices placed. Add at least three, then choose Finish polygon.`);
      });

      const wirePath = (path: Path) => {
        path.addListener("insert_at", readOverlays);
        path.addListener("set_at", readOverlays);
        path.addListener("remove_at", readOverlays);
      };
      const wire = (overlay: Polygon, index: number) => {
        overlay.addListener("click", () => {
          selectedIndex.current = index;
          overlays.current.forEach((item, itemIndex) => item.setEditable(itemIndex === index));
          setHint("Selected shape ready for vertex editing.");
        });
        overlay.addListener("rightclick", (event) => {
          if (typeof event?.vertex !== "number" || overlay.getPath().getLength() <= 3) return;
          overlay.getPath().removeAt(event.vertex);
        });
        wirePath(overlay.getPath());
      };
      // Assigned here so the overlay-complete callback and initial renderer use
      // the same listeners without depending on Google namespace types.
      wireOverlayRef.current = wire;

      const bounds = new maps.LatLngBounds();
      geometryParts(initialGeometry).forEach((part, index) => {
        const points = part[0].slice(0, -1).map(([lng, lat]) => ({ lat, lng }));
        points.forEach((point) => bounds.extend(point));
        const overlay = new maps.Polygon({
          paths: points, map: map.current, fillColor: "#4F46E5", fillOpacity: .2,
          strokeColor: "#4F46E5", strokeWeight: 3, editable: false,
        });
        overlays.current.push(overlay);
        wire(overlay, index);
      });
      if (!bounds.isEmpty()) map.current.fitBounds(bounds, 36);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Boundary editor could not load."));
    return () => {
      cancelled = true;
      drawingPreview.current?.setMap(null);
      overlays.current.forEach((overlay) => overlay.setMap(null));
      overlays.current = [];
    };
    // The editor intentionally initializes once per selected territory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, initialGeometry]);

  const restore = (nextIndex: number) => {
    const maps = mapsApi();
    if (!maps || !map.current || nextIndex < 0 || nextIndex >= history.current.length) return;
    historyIndex.current = nextIndex;
    const next = history.current[nextIndex];
    suppressHistory.current = true;
    overlays.current.forEach((overlay) => overlay.setMap(null));
    overlays.current = geometryParts(next).map((part, index) => {
      const overlay = new maps.Polygon({
        paths: part[0].slice(0, -1).map(([lng, lat]) => ({ lat, lng })), map: map.current,
        fillColor: "#4F46E5", fillOpacity: .2, strokeColor: "#4F46E5", strokeWeight: 3, editable: false,
      });
      wireOverlayRef.current(overlay, index);
      return overlay;
    });
    setGeometry(next);
    setError(validateTerritoryGeometry(next) ?? "");
    suppressHistory.current = false;
    setRevision((value) => value + 1);
  };

  const duplicate = () => {
    const index = selectedIndex.current;
    const source = index === null ? null : geometryParts(geometry)[index];
    if (!source) return setHint("Select a shape before duplicating it.");
    const shifted = source.map((ring) => ring.map(([lng, lat]) => [lng + .002, lat + .002]));
    const next = geometryFromParts([...geometryParts(geometry), shifted]);
    capture(next);
    restoreGeometryOnMap(next);
    setHint("Shape duplicated with a small offset. Drag vertices into position.");
  };
  const removeSelected = () => {
    const index = selectedIndex.current;
    if (index === null) return setHint("Select a shape before removing it.");
    const next = geometryFromParts(geometryParts(geometry).filter((_, itemIndex) => itemIndex !== index));
    capture(next);
    restoreGeometryOnMap(next);
    selectedIndex.current = null;
  };
  const startSplit = () => {
    startDrawing();
    setHint("Split mode: draw a replacement part, then select and remove the original shape when both replacement parts are ready.");
  };
  const mergeShapes = () => {
    const next = geometryFromParts(geometryParts(geometry));
    capture(next);
    setHint("All visible shapes are grouped into one auditable MultiPolygon territory. No area between disconnected shapes was invented.");
  };
  const restoreGeometryOnMap = (next: TerritoryGeometry | null) => {
    const maps = mapsApi();
    if (!maps || !map.current) return;
    overlays.current.forEach((overlay) => overlay.setMap(null));
    overlays.current = geometryParts(next).map((part, index) => {
      const overlay = new maps.Polygon({
        paths: part[0].slice(0, -1).map(([lng, lat]) => ({ lat, lng })), map: map.current,
        fillColor: "#4F46E5", fillOpacity: .2, strokeColor: "#4F46E5", strokeWeight: 3, editable: false,
      });
      wireOverlayRef.current(overlay, index);
      return overlay;
    });
  };
  const startDrawing = () => {
    if (!map.current || drawingActive.current) return;
    geometryBeforeDrawing.current=geometry;
    drawingActive.current = true;
    drawingPoints.current = [];
    setIsDrawing(true);
    map.current.setOptions({ draggableCursor: "crosshair", disableDoubleClickZoom: true });
    setHint("Click the map to place polygon vertices. Add at least three, then choose Finish polygon.");
  };
  const cancelDrawing = () => {
    drawingActive.current = false;
    drawingPoints.current = [];
    drawingPreview.current?.setMap(null);
    drawingPreview.current = null;
    setGeometry(geometryBeforeDrawing.current);
    setError(validateTerritoryGeometry(geometryBeforeDrawing.current)??"");
    setIsDrawing(false);
    map.current?.setOptions({ draggableCursor: null, disableDoubleClickZoom: false });
    setHint("Drawing cancelled.");
  };
  const finishDrawing = () => {
    const maps = mapsApi();
    if (!maps || !map.current || drawingPoints.current.length < 3) {
      setError("Add at least three vertices before finishing the polygon.");
      return;
    }
    const overlay = new maps.Polygon({
      paths: drawingPoints.current, map: map.current, fillColor: "#4F46E5", fillOpacity: .2,
      strokeColor: "#4F46E5", strokeWeight: 3, editable: true,
    });
    overlays.current.push(overlay);
    selectedIndex.current = overlays.current.length - 1;
    wireOverlayRef.current(overlay, overlays.current.length - 1);
    drawingPreview.current?.setMap(null);
    drawingPreview.current = null;
    drawingActive.current = false;
    drawingPoints.current = [];
    setIsDrawing(false);
    map.current.setOptions({ draggableCursor: null, disableDoubleClickZoom: false });
    setError("");
    setHint("Polygon added. Drag vertices or midpoint handles to refine its boundary.");
    readOverlays();
  };

  return <div className="territory-boundary-editor">
    <input type="hidden" name={name} value={geometry ? JSON.stringify(geometry) : ""}/>
    <div className="boundary-editor-toolbar">
      {!isDrawing ? <button type="button" onClick={startDrawing}>Draw polygon</button> : <>
        <button type="button" onClick={finishDrawing}>Finish polygon</button>
        <button type="button" onClick={cancelDrawing}>Cancel drawing</button>
      </>}
      <button type="button" onClick={() => restore(historyIndex.current - 1)} disabled={historyIndex.current === 0}>Undo</button>
      <button type="button" onClick={() => restore(historyIndex.current + 1)} disabled={historyIndex.current >= history.current.length - 1}>Redo</button>
      <button type="button" onClick={duplicate}>Duplicate shape</button>
      <button type="button" onClick={startSplit}>Split with new shape</button>
      <button type="button" onClick={mergeShapes} disabled={geometryParts(geometry).length < 2}>Merge shapes</button>
      <button type="button" onClick={removeSelected}>Remove shape</button>
    </div>
    <div ref={node} className="territory-boundary-map" aria-label="Visual polygon boundary editor"/>
    <p className={error ? "boundary-error" : ""} key={revision}>{error || hint}</p>
    <div className={`boundary-save-state ${geometry&&!error?"ready":"waiting"}`}><strong>{geometry&&!error?"Boundary ready to save":"Boundary not ready"}</strong><span>{geometryParts(geometry).length} shape{geometryParts(geometry).length===1?"":"s"} serialized with the form</span></div>
    <details><summary>Split and merge guidance</summary><p>To split a territory, draw each replacement shape and remove the original. Multiple shapes are saved together as one MultiPolygon territory. To merge shapes, keep the shapes that should operate as one territory and save—the boundary is stored as a single MultiPolygon without inventing area between disconnected shapes.</p></details>
  </div>;
}
