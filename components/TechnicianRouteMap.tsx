"use client";

import { useEffect, useRef, useState } from "react";
import { requireGoogleMapsLibrary } from "@/lib/googleMapsLibrary";

type Stop = { id: string; sequence: number; latitude: number; longitude: number; title: string; completed: boolean };

type TechWindow = Window & {
  google?: { maps?: {
      importLibrary?: (name: string) => Promise<unknown>;
      Map: new (element: HTMLElement, options: Record<string, unknown>) => { fitBounds: (bounds: unknown, padding?: number) => void };
      Marker: new (options: Record<string, unknown>) => unknown;
      Polyline: new (options: Record<string, unknown>) => unknown;
      LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void; isEmpty: () => boolean };
      geometry?: { encoding?: { decodePath: (value: string) => unknown[] } };
  } };
};

export default function TechnicianRouteMap({ apiKey, encodedPolyline, stops }: {
  apiKey?: string; encodedPolyline: string | null; stops: Stop[];
}) {
  const element = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error" | "unconfigured">(apiKey ? "loading" : "unconfigured");
  useEffect(() => {
    if (!apiKey || !element.current) return;
    let cancelled = false;
    const initialize = async () => {
      const maps = (window as TechWindow).google?.maps;
      if (!maps || !element.current || cancelled) { setState("error"); return; }
      try {
        await requireGoogleMapsLibrary(maps,"geometry",(value)=>Boolean(value.geometry?.encoding));
      } catch {
        if(!cancelled)setState("error");
        return;
      }
      if(!element.current||cancelled)return;
      const map = new maps.Map(element.current, { center: { lat: 33.4484, lng: -112.074 }, zoom: 10, mapTypeControl: false, streetViewControl: false });
      const bounds = new maps.LatLngBounds();
      if (encodedPolyline) {
        const path = maps.geometry!.encoding!.decodePath(encodedPolyline);
        new maps.Polyline({ map, path, strokeColor: "#4f46e5", strokeOpacity: .85, strokeWeight: 6 });
      }
      for (const stop of stops) {
        const position = { lat: stop.latitude, lng: stop.longitude };
        bounds.extend(position);
        new maps.Marker({ map, position, title: `Stop ${stop.sequence}: ${stop.title}`, label: { text: String(stop.sequence), color: "#fff", fontWeight: "800" }, opacity: stop.completed ? .5 : 1 });
      }
      if (!bounds.isEmpty()) map.fitBounds(bounds, 42);
      setState("ready");
    };
    if ((window as TechWindow).google?.maps) initialize();
    else {
      const existing = document.querySelector<HTMLScriptElement>('script[src^="https://maps.googleapis.com/maps/api/js"]');
      const script = existing ?? document.createElement("script");
      if (!existing) {
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
        script.async = true; script.defer = true; script.dataset.servonasTechRoute = "true";
        document.head.appendChild(script);
      }
      script.addEventListener("load", initialize, { once: true });
      script.addEventListener("error", () => setState("error"), { once: true });
    }
    return () => { cancelled = true; };
  }, [apiKey, encodedPolyline, stops]);
  return <div className="tech-route-map-wrap">
    <div ref={element} className="tech-route-map" aria-label="Map of today’s planned route"/>
    {state !== "ready" && <div className="tech-route-map-state" role="status">{state === "loading" ? "Loading planned route…" : state === "unconfigured" ? "Route map is not configured. Your ordered stops remain available below." : "The route map could not load. Check your connection; your ordered stops remain available below."}</div>}
  </div>;
}
