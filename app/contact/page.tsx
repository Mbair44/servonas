import { sendContactInquiry } from "./actions";

const contactEmail = "mbair@servonas.com";

export default async function Contact({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const query = await searchParams;

  return (
    <main>
      <section className="sv-page-hero contact-hero">
        <div className="sv-container contact-layout">
          <div className="contact-intro">
            <span className="sv-kicker">Contact</span>
            <h1>Let’s talk about your service business.</h1>
            <p>
              Tell us what you’re working on and we’ll respond directly. Your
              message is sent securely to the Servonas team—no email app needed.
            </p>
            <small>
              Prefer email? Reach us at{" "}
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
            </small>
          </div>

          <div className="contact-card">
            {query.sent === "1" && (
              <div className="workspace-notice success" role="status">
                Thanks—your message was sent. We’ll be in touch soon.
              </div>
            )}
            {query.error && (
              <div className="workspace-notice error" role="alert">
                {query.error}
              </div>
            )}

            <form className="contact-form" action={sendContactInquiry}>
              <div className="contact-form-row">
                <label>
                  Name
                  <input
                    required
                    name="name"
                    autoComplete="name"
                    maxLength={120}
                  />
                </label>
                <label>
                  Work email
                  <input
                    required
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                  />
                </label>
              </div>
              <div className="contact-form-row">
                <label>
                  Company <small>Optional</small>
                  <input
                    name="company"
                    autoComplete="organization"
                    maxLength={160}
                  />
                </label>
                <label>
                  Phone <small>Optional</small>
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={40}
                  />
                </label>
              </div>
              <label>
                How can we help?
                <textarea required name="message" rows={6} maxLength={5000} />
              </label>

              <label className="contact-honeypot" aria-hidden="true">
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>

              <button className="sv-button sv-full" type="submit">
                Send message
              </button>
              <p className="contact-privacy">
                We’ll only use these details to respond to your inquiry.
              </p>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
