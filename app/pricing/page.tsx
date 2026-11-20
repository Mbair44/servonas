import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Party Rental Software Early Access | Servonas",
  description:
    "Join early access for Servonas, party rental software for bounce house, inflatable, and event rental businesses.",
  alternates: { canonical: "/pricing" },
};

export default function Pricing() {
  return (
    <main className="pricing-page">
      <section className="pricing-hero">
        <div className="sv-container">
          <span className="sv-kicker">Servonas early access</span>
          <h1>Simple pricing is coming.</h1>
          <p>
            We&apos;re opening Servonas to a limited number of party rental
            businesses while we finalize plans and pricing.
          </p>
          <div className="sv-actions">
            <Link className="sv-button" href="/early-access">
              Join Early Access
            </Link>
            <Link className="sv-button sv-secondary" href="/party-rental-software">
              Explore party rental software
            </Link>
          </div>
        </div>
      </section>

      <section className="sv-section">
        <div className="sv-container pricing-content">
          <div className="sv-heading">
            <span className="sv-kicker">Help shape what comes next</span>
            <h2>Built with party rental operators.</h2>
            <p>
              Early-access conversations help us understand the workflows that
              matter most for bounce house, inflatable, and event rental
              businesses. We&apos;ll share plan and pricing details directly when
              they are ready.
            </p>
          </div>
          <div className="pricing-assurances">
            <article>
              <div>
                <strong>Tell us about your operation</strong>
                <span>Share the equipment, event dates, and delivery work your team manages.</span>
              </div>
            </article>
            <article>
              <div>
                <strong>See the workflow in context</strong>
                <span>Explore how bookings, inventory, payment terms, and delivery work can stay connected.</span>
              </div>
            </article>
            <article>
              <div>
                <strong>Get details when they are ready</strong>
                <span>We&apos;ll follow up with early-access availability, plans, and pricing information.</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="pricing-bottom-cta">
        <div className="sv-container">
          <div>
            <h2>Want to help shape Servonas?</h2>
            <p>Join early access to tell us how your rental operation works.</p>
          </div>
          <Link className="sv-button" href="/early-access">
            Join Early Access
          </Link>
        </div>
      </section>
    </main>
  );
}
