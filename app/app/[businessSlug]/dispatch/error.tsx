"use client";
export default function DispatchError({ reset }: { error: Error; reset: () => void }) {
  return <main className="dispatch-error" role="alert"><h1>Dispatch routes could not be loaded</h1><p>Assignments and schedules remain available. Try loading the route workspace again.</p><button className="sv-button" onClick={reset}>Try again</button></main>;
}
