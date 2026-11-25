import { sendContactInquiry } from "./actions";

export default async function Contact({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; interest?: string }>;
}) {
  const query = await searchParams;
  const earlyAccess = query.interest === "early-access";

  return (
    <main>
      <section className="sv-page-hero contact-hero">
        <div className="sv-container contact-layout">
          <div className="contact-intro">
            <span className="sv-kicker">{earlyAccess ? "Early access" : "Contact"}</span>
            <h1>{earlyAccess ? "Join Servonas early access." : "Let’s talk about your service business."}</h1>
            <p>
              {earlyAccess
                ? "Tell us about your party rental business. We’ll route your early-access interest to the Servonas team and respond directly."
                : "Tell us what you’re working on and we’ll respond directly. Your message is sent securely to the Servonas team."}
            </p>
          </div>

          <div className="contact-card">
            {query.sent === "1" && (
              <div className="workspace-notice success" role="status">
                {earlyAccess
                  ? "Thanks—your early-access interest was received. We’ll be in touch soon."
                  : "Thanks—your message was sent. We’ll be in touch soon."}
              </div>
            )}
            {query.error && (
              <div className="workspace-notice error" role="alert">
                {query.error}
              </div>
            )}

            <form className="contact-form" action={sendContactInquiry}>
              {earlyAccess && <input type="hidden" name="interest" value="early-access" />}
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
                {earlyAccess ? "Tell us about your rental business" : "How can we help?"}
                <textarea required name="message" rows={6} maxLength={5000} />
              </label>

              <label className="contact-honeypot" aria-hidden="true">
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>

              <button className="sv-button sv-full" type="submit">
                {earlyAccess ? "Join Early Access" : "Send message"}
              </button>
              <p className="contact-privacy">
                {earlyAccess
                  ? "We’ll only use these details to respond about early access."
                  : "We’ll only use these details to respond to your inquiry."}
              </p>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
