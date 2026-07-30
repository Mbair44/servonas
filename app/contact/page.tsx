"use client";

import { useEffect } from "react";

const contactEmail = "mbair@servonas.com";
const contactHref = `mailto:${contactEmail}?subject=${encodeURIComponent("Servonas inquiry")}`;

export default function Contact() {
  useEffect(() => {
    window.location.href = contactHref;
  }, []);

  return (
    <main>
      <section className="sv-page-hero">
        <div className="sv-container">
          <span className="sv-kicker">Contact</span>
          <h1>Opening your email app…</h1>
          <p>
            If it does not open automatically,{" "}
            <a href={contactHref}>email {contactEmail}</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
