"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { CrmActionState } from "@/app/app/[businessSlug]/customers/actions";

type Location = Record<string, string | boolean | number | null | undefined>;

export default function ServiceLocationForm({
  action,
  location,
  googleMapsApiKey,
}: {
  action: (state: CrmActionState, formData: FormData) => Promise<CrmActionState>;
  location?: Location;
  googleMapsApiKey?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [placeId, setPlaceId] = useState(String(location?.google_place_id ?? ""));
  const [address, setAddress] = useState(String(location?.street_address ?? ""));
  const addressRef = useRef<HTMLInputElement>(null);
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;

  useEffect(() => {
    if (!googleMapsApiKey || !addressRef.current) return;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const initialize = () => {
      const maps = (window as typeof window & { google?: { maps?: { places?: { Autocomplete: new (input: HTMLInputElement, options: object) => { addListener: (name: string, callback: () => void) => void; getPlace: () => { place_id?: string; formatted_address?: string } } } } } }).google?.maps;
      if (!maps?.places || !addressRef.current) {
        if (++attempts < 20) timer = setTimeout(initialize, 150);
        return;
      }
      const autocomplete = new maps.places.Autocomplete(addressRef.current, { types: ["address"], fields: ["place_id", "formatted_address"] });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.place_id && place.formatted_address) {
          setPlaceId(place.place_id);
          setAddress(place.formatted_address);
        }
      });
    };
    if ((window as typeof window & { google?: { maps?: { places?: unknown } } }).google?.maps?.places) initialize();
    else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-servonas-google-places="true"]');
      if (existing) existing.addEventListener("load", initialize, { once: true });
      else {
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsApiKey)}&libraries=places`;
        script.async = true; script.defer = true; script.dataset.servonasGooglePlaces = "true";
        script.addEventListener("load", initialize, { once: true });
        document.head.appendChild(script);
      }
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [googleMapsApiKey]);

  return <form action={formAction} className="crm-form">
    {state.error && <div className="workspace-notice error crm-wide" role="alert">{state.error}</div>}
    <input type="hidden" name="googlePlaceId" value={placeId}/>
    <label>Location name<input name="locationName" required defaultValue={value("locationName", String(location?.location_name ?? "Home"))}/></label>
    <label>Street address<input ref={addressRef} name="streetAddress" required autoComplete="off" value={address} onChange={(event) => { setAddress(event.target.value); setPlaceId(""); }}/></label>
    {state.fieldErrors?.address && <small className="crm-field-error crm-wide">{state.fieldErrors.address}</small>}
    <label>Unit or suite<input name="unit" defaultValue={value("unit", String(location?.unit ?? ""))}/></label>
    <label>City<input name="city" required defaultValue={value("city", String(location?.city ?? ""))}/></label>
    <label>State<input name="state" required defaultValue={value("state", String(location?.state ?? ""))}/></label>
    <label>Postal code<input name="postalCode" required defaultValue={value("postalCode", String(location?.postal_code ?? ""))}/></label>
    <label>Country<input name="country" defaultValue={value("country", String(location?.country ?? "US"))}/></label>
    <label>Gate code<input name="gateCode" defaultValue={value("gateCode", String(location?.gate_code ?? ""))}/></label>
    <label className="crm-wide">Access instructions<textarea name="accessInstructions" rows={3} defaultValue={value("accessInstructions", String(location?.access_instructions ?? ""))}/></label>
    <label className="crm-wide">Parking notes<textarea name="parkingNotes" rows={2} defaultValue={value("parkingNotes", String(location?.parking_notes ?? ""))}/></label>
    <label className="crm-wide">Property notes<textarea name="propertyNotes" rows={3} defaultValue={value("propertyNotes", String(location?.property_notes ?? ""))}/></label>
    <label><span>Primary location</span><select name="isPrimary" defaultValue={value("isPrimary", String(location?.is_primary ?? false))}><option value="false">No</option><option value="true">Yes</option></select></label>
    <label><span>Pets present</span><select name="petsPresent" defaultValue={value("petsPresent", String(location?.pets_present ?? false))}><option value="false">No / unknown</option><option value="true">Yes</option></select></label>
    <label><span>Status</span><select name="isActive" defaultValue={value("isActive", String(location?.is_active ?? true))}><option value="true">Active</option><option value="false">Inactive</option></select></label>
    <button className="sv-button" disabled={pending}>{pending ? "Saving…" : "Save location"}</button>
    <small className="crm-wide crm-help">{googleMapsApiKey ? "Choose a Google suggestion to verify and standardize the address." : "Google verification is not configured; structured address fields will be saved."}</small>
  </form>;
}
