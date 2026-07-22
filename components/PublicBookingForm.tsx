"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface Service {
  id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  price_amount?: number | null;
  price_label?: "fixed" | "starting_at" | "quote" | string | null;
}

interface DayHours {
  start: string;
  end: string;
}

interface Props {
  action: (formData: FormData) => void | Promise<void>;
  services: Service[];
  schedule: Record<number, DayHours>;
  collectAddress: boolean;
  intakeQuestions: string[];
  businessName: string;
  minimumNoticeHours: number;
  maximumDaysAhead: number;
  googleMapsApiKey?: string;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function serviceLabel(service: Service) {
  const amount = Number(service.price_amount ?? 0);
  if (amount <= 0 || service.price_label === "quote") return service.name;
  const prefix = service.price_label === "starting_at" ? "Starting at " : "";
  return `${service.name} · ${prefix}${money.format(amount)}`;
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function timeLabel(totalMinutes: number) {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export default function PublicBookingForm({
  action,
  services,
  schedule,
  collectAddress,
  intakeQuestions,
  businessName,
  minimumNoticeHours,
  maximumDaysAhead,
  googleMapsApiKey,
}: Props) {
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [address, setAddress] = useState("");
  const [placeId, setPlaceId] = useState("");
  const addressRef = useRef<HTMLInputElement>(null);

  const selectedService = services.find((service) => service.id === serviceId);

  const availableTimes = useMemo(() => {
    if (!date || !selectedService) return [];
    const dateParts = date.split("-").map(Number);
    const weekday = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]).getDay();
    const hours = schedule[weekday];
    if (!hours) return [];

    const start = minutes(hours.start);
    const end = minutes(hours.end);
    const duration = Number(selectedService.duration_minutes || 0);
    const slots: number[] = [];

    for (let slot = Math.ceil(start / 30) * 30; slot + duration <= end; slot += 30) {
      const candidate = new Date(
        dateParts[0],
        dateParts[1] - 1,
        dateParts[2],
        Math.floor(slot / 60),
        slot % 60,
      );
      if (candidate.getTime() >= Date.now() + minimumNoticeHours * 60 * 60 * 1000) {
        slots.push(slot);
      }
    }

    return slots;
  }, [date, minimumNoticeHours, schedule, selectedService]);

  useEffect(() => {
    setTime("");
  }, [date, serviceId]);

  useEffect(() => {
    if (!collectAddress || !googleMapsApiKey || !addressRef.current) return;

    const initialize = () => {
      const maps = (window as any).google?.maps;
      if (!maps?.places || !addressRef.current) return;
      const autocomplete = new maps.places.Autocomplete(addressRef.current, {
        types: ["address"],
        fields: ["place_id", "formatted_address", "address_components"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place?.place_id || !place?.formatted_address) return;
        setPlaceId(place.place_id);
        setAddress(place.formatted_address);
      });
    };

    if ((window as any).google?.maps?.places) {
      initialize();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-servonas-google-places="true"]',
    );
    if (existing) {
      existing.addEventListener("load", initialize, { once: true });
      return () => existing.removeEventListener("load", initialize);
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      googleMapsApiKey,
    )}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.dataset.servonasGooglePlaces = "true";
    script.addEventListener("load", initialize, { once: true });
    document.head.appendChild(script);
    return () => script.removeEventListener("load", initialize);
  }, [collectAddress, googleMapsApiKey]);

  const today = new Date();
  const minDate = today.toISOString().slice(0, 10);
  const maxDateValue = new Date(today.getTime() + maximumDaysAhead * 86400000)
    .toISOString()
    .slice(0, 10);
  const startsAt = date && time ? `${date}T${time}` : "";

  return (
    <form action={action} className="public-booking-form">
      <input className="honeypot" name="companyWebsite" tabIndex={-1} autoComplete="off" />
      <input type="hidden" name="requestKey" value={crypto.randomUUID()} />
      <input type="hidden" name="startsAt" value={startsAt} />
      <input type="hidden" name="addressPlaceId" value={placeId} />

      <label>
        Service
        <select
          name="serviceId"
          required
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
        >
          <option value="" disabled>
            Choose a service
          </option>
          {services.map((service) => (
            <option value={service.id} key={service.id}>
              {serviceLabel(service)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Appointment date
        <input
          name="appointmentDate"
          type="date"
          required
          min={minDate}
          max={maxDateValue}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>

      <label className="wide">
        Appointment time
        <select
          name="appointmentTime"
          required
          value={time}
          onChange={(event) => setTime(event.target.value)}
          disabled={!serviceId || !date}
        >
          <option value="">
            {!serviceId
              ? "Choose a service first"
              : !date
                ? "Choose a date first"
                : availableTimes.length
                  ? "Choose a time"
                  : "No times available on this date"}
          </option>
          {availableTimes.map((slot) => {
            const value = `${String(Math.floor(slot / 60)).padStart(2, "0")}:${String(
              slot % 60,
            ).padStart(2, "0")}`;
            return (
              <option key={value} value={value}>
                {timeLabel(slot)}
              </option>
            );
          })}
        </select>
      </label>

      <div className="booking-hours wide">
        <b>Available hours</b>
        <span>
          {[0, 1, 2, 3, 4, 5, 6]
            .map((day) =>
              schedule[day]
                ? `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]} ${schedule[day].start}–${schedule[day].end}`
                : null,
            )
            .filter(Boolean)
            .join(" · ")}
        </span>
        <small>Appointment times are offered in 30-minute increments.</small>
      </div>

      <label>
        First name
        <input name="firstName" required autoComplete="given-name" />
      </label>
      <label>
        Last name
        <input name="lastName" autoComplete="family-name" />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" />
      </label>
      <label>
        Phone
        <input name="phone" type="tel" autoComplete="tel" />
      </label>

      {collectAddress && (
        <label className="wide">
          Service address
          <input
            ref={addressRef}
            name="address"
            autoComplete="street-address"
            required
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              setPlaceId("");
            }}
            placeholder="Start typing and select an address"
          />
          {googleMapsApiKey ? (
            <small className="field-help">Select an address from Google’s suggestions.</small>
          ) : (
            <small className="field-help warning">
              Google address verification is not configured yet.
            </small>
          )}
        </label>
      )}

      <label className="wide">
        How can we help?
        <textarea name="details" rows={4} />
      </label>
      {intakeQuestions.map((question, index) => (
        <label className="wide" key={index}>
          {question}
          <input name={`question_${index}`} />
        </label>
      ))}
      <button>Request appointment</button>
      <small className="wide booking-privacy">
        Your information is sent securely to {businessName} through Servonas.
      </small>
    </form>
  );
}
