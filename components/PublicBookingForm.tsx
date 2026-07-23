"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";

interface Service {
  id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  price_amount?: number | null;
  price_label?: "fixed" | "starting_at" | "quote" | string | null;
}
interface DayHours { start: string; end: string }
export type BookingActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};
interface Props {
  action: (state: BookingActionState, formData: FormData) => Promise<BookingActionState>;
  services: Service[];
  schedule: Record<number, DayHours>;
  collectAddress: boolean;
  intakeQuestions: string[];
  businessName: string;
  maximumDaysAhead: number;
  googleMapsApiKey?: string;
  publicSlug: string;
  timezone: string;
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const initialState: BookingActionState = {};

function serviceLabel(service: Service) {
  const amount = Number(service.price_amount ?? 0);
  if (amount <= 0 || service.price_label === "quote") return service.name;
  return `${service.name} · ${service.price_label === "starting_at" ? "Starting at " : ""}${money.format(amount)}`;
}
function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function timeLabel(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

export default function PublicBookingForm(props: Props) {
  const [state, formAction, pending] = useActionState(props.action, initialState);
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [address, setAddress] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [availability, setAvailability] = useState<Record<string, string[]>>({});
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [addressLookupError, setAddressLookupError] = useState("");
  const addressRef = useRef<HTMLInputElement>(null);
  const sessionId = useRef(crypto.randomUUID());
  const requestKey = useRef(crypto.randomUUID());

  const track = (event: string, metadata: object = {}) => {
    void fetch(`/api/public-booking/${props.publicSlug}/analytics`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, sessionId: sessionId.current, serviceId: serviceId || null, metadata }),
      keepalive: true,
    });
  };

  useEffect(() => { track("page_viewed"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!serviceId) { setAvailability({}); return; }
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const start = isoDate(year, monthIndex, 1);
    const end = isoDate(year, monthIndex, new Date(year, monthIndex + 1, 0).getDate());
    const controller = new AbortController();
    setLoadingAvailability(true);
    setAvailabilityError("");
    track("calendar_viewed", { month: start.slice(0, 7) });
    fetch(`/api/public-booking/${props.publicSlug}/availability?serviceId=${encodeURIComponent(serviceId)}&start=${start}&end=${end}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Availability could not be loaded.");
        return response.json() as Promise<{ dates: Record<string, string[]> }>;
      })
      .then((payload) => setAvailability(payload.dates))
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") setAvailabilityError(error.message);
      })
      .finally(() => setLoadingAvailability(false));
    return () => controller.abort();
  }, [month, props.publicSlug, serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setTime(""); }, [date, serviceId]);
  useEffect(() => {
    if (!props.collectAddress || !props.googleMapsApiKey || !addressRef.current) return;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const initialize = () => {
      const maps = (window as typeof window & { google?: { maps?: { places?: { Autocomplete: new (input: HTMLInputElement, options: object) => { addListener: (name: string, callback: () => void) => void; getPlace: () => { place_id?: string; formatted_address?: string } } } } } }).google?.maps;
      if (!maps?.places || !addressRef.current) {
        attempts += 1;
        if (attempts < 20) retryTimer = setTimeout(initialize, 150);
        else setAddressLookupError("Address suggestions could not be loaded. Please refresh and try again.");
        return;
      }
      const autocomplete = new maps.places.Autocomplete(addressRef.current, { types: ["address"], fields: ["place_id", "formatted_address"] });
      setAddressLookupError("");
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.place_id && place.formatted_address) { setPlaceId(place.place_id); setAddress(place.formatted_address); }
      });
    };
    if ((window as typeof window & { google?: { maps?: { places?: unknown } } }).google?.maps?.places) { initialize(); return; }
    const existing = document.querySelector<HTMLScriptElement>('script[data-servonas-google-places="true"]');
    if (existing) { existing.addEventListener("load", initialize, { once: true }); return () => existing.removeEventListener("load", initialize); }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(props.googleMapsApiKey)}&libraries=places`;
    script.async = true; script.defer = true; script.dataset.servonasGooglePlaces = "true";
    script.addEventListener("load", initialize, { once: true });
    script.addEventListener("error", () => setAddressLookupError("Address suggestions could not be loaded. Please refresh and try again."), { once: true });
    document.head.appendChild(script);
    return () => {
      script.removeEventListener("load", initialize);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [props.collectAddress, props.googleMapsApiKey]);

  const calendarDays = useMemo(() => {
    const year = month.getFullYear(), monthIndex = month.getMonth();
    const count = new Date(year, monthIndex + 1, 0).getDate();
    return [...Array(new Date(year, monthIndex, 1).getDay()).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [month]);
  const availableTimes = availability[date] ?? [];
  const todayMonth = new Date(); todayMonth.setDate(1); todayMonth.setHours(0, 0, 0, 0);
  const maxMonth = new Date(); maxMonth.setDate(1); maxMonth.setMonth(maxMonth.getMonth() + Math.ceil(props.maximumDaysAhead / 30));
  const fieldError = (name: string) => state.fieldErrors?.[name] ? <small className="field-error">{state.fieldErrors[name]}</small> : null;

  return (
    <form action={formAction} className="public-booking-form" onSubmit={() => track("booking_submitted")}>
      <input className="honeypot" name="companyWebsite" tabIndex={-1} autoComplete="off" />
      <input type="hidden" name="requestKey" value={requestKey.current} />
      <input type="hidden" name="startsAt" value={date && time ? `${date}T${time}` : ""} />
      <input type="hidden" name="addressPlaceId" value={placeId} />
      {state.error && <div className="booking-form-error wide" role="alert">{state.error}</div>}

      <label className="wide">Service
        <select name="serviceId" required value={serviceId} onChange={(event) => { setServiceId(event.target.value); setDate(""); }}>
          <option value="" disabled>Choose a service</option>
          {props.services.map((service) => <option value={service.id} key={service.id}>{serviceLabel(service)}</option>)}
        </select>
        {fieldError("serviceId")}
      </label>

      <section className="booking-calendar wide" aria-label="Choose an appointment date">
        <div className="booking-calendar-head">
          <button type="button" aria-label="Previous month" disabled={month <= todayMonth} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <h2>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
          <button type="button" aria-label="Next month" disabled={month >= maxMonth} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
        </div>
        <div className="booking-weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        {!serviceId ? <div className="booking-calendar-empty">Choose a service to see available dates.</div> :
          loadingAvailability ? <div className="booking-calendar-skeleton" aria-label="Loading availability">{Array.from({ length: 35 }, (_, index) => <span key={index} />)}</div> :
          availabilityError ? <div className="booking-calendar-empty error" role="alert">{availabilityError}</div> :
          <div className="booking-calendar-grid">
            {calendarDays.map((day, index) => {
              if (!day) return <span key={`blank-${index}`} />;
              const value = isoDate(month.getFullYear(), month.getMonth(), day);
              const enabled = (availability[value]?.length ?? 0) > 0;
              return <button type="button" key={value} disabled={!enabled} aria-label={`${value}${enabled ? "" : ", unavailable"}`} aria-pressed={date === value} className={date === value ? "selected" : ""} onClick={() => setDate(value)}>{day}</button>;
            })}
          </div>}
        {fieldError("startsAt")}
      </section>

      <fieldset className="booking-times wide" disabled={!date || loadingAvailability}>
        <legend>Available times</legend>
        {!date ? <p>Choose an available date.</p> : availableTimes.length ? (
          <div className="booking-time-grid">{availableTimes.map((value) => <button type="button" className={time === value ? "selected" : ""} aria-pressed={time === value} key={value} onClick={() => { setTime(value); track("time_selected", { date, time: value }); }}>{timeLabel(value)}</button>)}</div>
        ) : <p>No appointment times remain on this date.</p>}
        <small>Times shown in {props.timezone.replace("_", " ")}.</small>
      </fieldset>

      <div className="booking-hours wide"><b>Business hours</b><span>{Object.entries(props.schedule).map(([day, hours]) => `${weekdays[Number(day)]} ${hours.start}–${hours.end}`).join(" · ")}</span></div>
      <label>First name<input name="firstName" required autoComplete="given-name" defaultValue={state.values?.firstName} />{fieldError("firstName")}</label>
      <label>Last name<input name="lastName" autoComplete="family-name" defaultValue={state.values?.lastName} /></label>
      <label>Email<input name="email" type="email" autoComplete="email" defaultValue={state.values?.email} />{fieldError("email")}</label>
      <label>Phone<input name="phone" type="tel" autoComplete="tel" defaultValue={state.values?.phone} />{fieldError("phone")}</label>
      {props.collectAddress && <label className="wide">Service address<input ref={addressRef} name="address" autoComplete="off" required value={address} onChange={(event) => { setAddress(event.target.value); setPlaceId(""); }} placeholder="Start typing and select an address" aria-describedby="address-help" />{fieldError("address")}{addressLookupError && <small className="field-error" role="alert">{addressLookupError}</small>}<small id="address-help" className="field-help">{props.googleMapsApiKey ? "Select an address from Google’s suggestions." : "Address verification is not configured."}</small></label>}
      <label className="wide">How can we help?<textarea name="details" rows={4} defaultValue={state.values?.details} /></label>
      {props.intakeQuestions.map((question, index) => <label className="wide" key={question}>{question}<input name={`question_${index}`} defaultValue={state.values?.[`question_${index}`]} /></label>)}
      <button className="booking-submit" disabled={pending || !time}>{pending ? <><span className="button-spinner" /> Booking…</> : "Request appointment"}</button>
      <small className="wide booking-privacy">Your information is sent securely to {props.businessName} through Servonas.</small>
    </form>
  );
}
