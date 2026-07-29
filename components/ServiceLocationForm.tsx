"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { CrmActionState } from "@/app/app/[businessSlug]/customers/actions";
import { parseGoogleAddressComponents, type GoogleAddressComponent } from "@/lib/googleAddressComponents";

type Location = Record<string, string | boolean | number | null | undefined>;

function LocationFormIcon({name}:{name:"home"|"notes"|"service"|"pin"|"save"}){
 const paths={
  home:<><path d="m3 11 9-7 9 7"/><path d="M5.5 10v10h13V10"/><path d="M9 20v-6h6v6"/></>,
  notes:<><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/></>,
  service:<><circle cx="8" cy="8" r="3"/><circle cx="17" cy="7" r="2.5"/><path d="M3 20v-2a5 5 0 0 1 10 0v2M14 20v-1.5a4 4 0 0 1 7-2.7"/></>,
  pin:<><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  save:<><path d="M5 3h12l2 2v16H5Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>,
 };
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function ServiceLocationForm({
  action,
  location,
  googleMapsApiKey,
  onCancel,
}: {
  action: (state: CrmActionState, formData: FormData) => Promise<CrmActionState>;
  location?: Location;
  googleMapsApiKey?: string;
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [placeId, setPlaceId] = useState(String(location?.google_place_id ?? ""));
  const [address, setAddress] = useState(String(location?.street_address ?? ""));
  const [unit, setUnit] = useState(String(location?.unit ?? ""));
  const [city, setCity] = useState(String(location?.city ?? ""));
  const [region, setRegion] = useState(String(location?.state ?? ""));
  const [postalCode, setPostalCode] = useState(String(location?.postal_code ?? ""));
  const [country, setCountry] = useState(String(location?.country ?? "US"));
  const addressRef = useRef<HTMLInputElement>(null);
  const value = (name: string, fallback = "") => state.values?.[name] ?? fallback;

  useEffect(() => {
    if (!googleMapsApiKey || !addressRef.current) return;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const initialize = () => {
      const maps = (window as typeof window & { google?: { maps?: { places?: { Autocomplete: new (input: HTMLInputElement, options: object) => { addListener: (name: string, callback: () => void) => void; getPlace: () => { place_id?: string; formatted_address?: string; address_components?: GoogleAddressComponent[] } } } } } }).google?.maps;
      if (!maps?.places || !addressRef.current) {
        if (++attempts < 20) timer = setTimeout(initialize, 150);
        return;
      }
      const autocomplete = new maps.places.Autocomplete(addressRef.current, { types: ["address"], fields: ["place_id", "formatted_address", "address_components"] });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.place_id && place.formatted_address) {
          const structured = parseGoogleAddressComponents(place.address_components, place.formatted_address);
          setPlaceId(place.place_id);
          setAddress(structured.streetAddress);
          setUnit(structured.unit);
          setCity(structured.city);
          setRegion(structured.state);
          setPostalCode(structured.postalCode);
          setCountry(structured.country);
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

  return <form action={formAction} className="crm-form location-drawer-form">
    {state.error && <div className="workspace-notice error crm-wide" role="alert">{state.error}</div>}
    <input type="hidden" name="googlePlaceId" value={placeId}/>
    <fieldset aria-labelledby="location-details-heading">
      <div className="location-section-heading wide" id="location-details-heading"><i><LocationFormIcon name="home"/></i><span><strong>Location details</strong><small>Basic information about this service location.</small></span></div>
      <label className="wide"><span className="location-field-title">Location name <b>*</b></span><input name="locationName" required defaultValue={value("locationName", String(location?.location_name ?? "Home"))}/><small>Give this location a name to help you identify it.</small></label>
      <label className="wide"><span className="location-field-title">Street address <b>*</b></span><span className="location-address-input"><input ref={addressRef} name="streetAddress" required autoComplete="off" placeholder="Start typing an address…" value={address} onChange={(event) => { setAddress(event.target.value); setPlaceId(""); }}/><i><LocationFormIcon name="pin"/></i></span></label>
      {state.fieldErrors?.address && <small className="crm-field-error wide">{state.fieldErrors.address}</small>}
      <label><span className="location-field-title">Unit or suite</span><input name="unit" placeholder="Apt, ste, unit, etc." value={unit} onChange={(event) => setUnit(event.target.value)}/></label>
      <label><span className="location-field-title">City <b>*</b></span><input name="city" required placeholder="City" value={city} onChange={(event) => { setCity(event.target.value); setPlaceId(""); }}/></label>
      <label><span className="location-field-title">State <b>*</b></span><select name="state" required value={region} onChange={(event) => { setRegion(event.target.value); setPlaceId(""); }}><option value="">Select state</option>{["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"].map(item=><option key={item} value={item}>{item}</option>)}</select></label>
      <label><span className="location-field-title">Postal code <b>*</b></span><input name="postalCode" required placeholder="ZIP / Postal code" value={postalCode} onChange={(event) => { setPostalCode(event.target.value); setPlaceId(""); }}/></label>
      <label><span className="location-field-title">Country <b>*</b></span><select name="country" required value={country} onChange={(event) => { setCountry(event.target.value); setPlaceId(""); }}><option value="US">United States</option><option value="CA">Canada</option></select></label>
      <label><span className="location-field-title">Gate code</span><input name="gateCode" placeholder="Optional" defaultValue={value("gateCode", String(location?.gate_code ?? ""))}/></label>
      <small className="wide crm-help">{googleMapsApiKey ? "Choose a Google suggestion to verify and standardize the address." : "Google verification is not configured; structured address fields will be saved."}</small>
    </fieldset>
    <fieldset aria-labelledby="location-notes-heading">
      <div className="location-section-heading wide" id="location-notes-heading"><i className="notes"><LocationFormIcon name="notes"/></i><span><strong>Location notes <em>(optional)</em></strong><small>Notes to help your team when they arrive on site.</small></span></div>
      <label className="wide"><span className="location-field-title">Access instructions</span><textarea name="accessInstructions" rows={2} placeholder="e.g., Back gate is on the left. Ring doorbell." defaultValue={value("accessInstructions", String(location?.access_instructions ?? ""))}/></label>
      <label className="wide"><span className="location-field-title">Parking notes</span><textarea name="parkingNotes" rows={2} placeholder="e.g., Park in driveway or on the street." defaultValue={value("parkingNotes", String(location?.parking_notes ?? ""))}/></label>
      <label className="wide"><span className="location-field-title">Property notes</span><textarea name="propertyNotes" rows={2} placeholder="e.g., Dog in backyard. Beware of loose screen on side door." defaultValue={value("propertyNotes", String(location?.property_notes ?? ""))}/></label>
    </fieldset>
    <fieldset aria-labelledby="location-service-heading">
      <div className="location-section-heading wide" id="location-service-heading"><i className="service"><LocationFormIcon name="service"/></i><span><strong>Service information</strong><small>Details that help us provide the best service.</small></span></div>
      <div className="location-service-grid wide">
        <label><span>Primary location</span><select name="isPrimary" defaultValue={value("isPrimary", String(location?.is_primary ?? false))}><option value="true">Yes</option><option value="false">No</option></select></label>
        <label><span>Pets present</span><select name="petsPresent" defaultValue={value("petsPresent", String(location?.pets_present ?? false))}><option value="false">No / unknown</option><option value="true">Yes</option></select></label>
        <label><span>Status</span><select name="isActive" defaultValue={value("isActive", String(location?.is_active ?? true))}><option value="true">Active</option><option value="false">Inactive</option></select></label>
      </div>
    </fieldset>
    <footer><button type="button" className="sv-button sv-secondary" onClick={onCancel}>Cancel</button><button className="sv-button location-save-button" disabled={pending}>{!pending&&<LocationFormIcon name="save"/>}{pending ? "Saving…" : "Save location"}</button></footer>
  </form>;
}
