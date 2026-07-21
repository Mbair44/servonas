import Link from "next/link";

const modules = [
  ["Booking", "Live availability, deposits, quotes, and online checkout."],
  ["Operations", "Scheduling, dispatch, blocked dates, and team calendars."],
  ["Inventory", "Quantities, galleries, utilization, and double-booking protection."],
  ["Customers", "CRM, receipts, review requests, and automated follow-up."],
  ["Payments", "Stripe payments, refunds, coupons, balances, and invoices."],
  ["AI", "A future-ready foundation for intake, recommendations, and support."],
];

export default function HomePage(){return <main>
  <section className="sv-hero"><div className="sv-glow sv-g1"/><div className="sv-glow sv-g2"/><div className="sv-container sv-hero-grid">
    <div><span className="sv-kicker">One platform. Every customer interaction.</span><h1>Run your entire service business <span>from one place.</span></h1><p>Servonas brings booking, scheduling, inventory, payments, communication, and reporting together—without forcing you to stitch five tools into one workflow.</p><div className="sv-actions"><Link className="sv-button" href="/onboarding">Start Free</Link><Link className="sv-button sv-secondary" href="/demo">Try the Demo</Link></div><div className="sv-proof"><span>✓ Built for rentals</span><span>✓ Built for appointments</span><span>✓ Built for services</span></div></div>
    <div className="sv-dashboard-card"><div className="sv-window"><span/><span/><span/></div><div className="sv-metrics"><div><small>Revenue</small><strong>$24,860</strong><em>+18.4%</em></div><div><small>Bookings</small><strong>148</strong><em>+12 this week</em></div><div><small>Utilization</small><strong>72%</strong><em>Top item: Blue Slide</em></div></div><div className="sv-calendar"><div className="sv-cal-head">Today’s schedule <b>View all</b></div>{["8:00  Delivery · Gilbert","10:30  HVAC estimate · Mesa","1:00  Party setup · Chandler","3:30  Mobile detail · Queen Creek"].map((x,i)=><div className="sv-event" key={x}><span>{i+1}</span>{x}</div>)}</div></div>
  </div></section>

  <section className="sv-logo-strip"><div className="sv-container"><span>Built from real operations</span><strong>NRS Party Rentals</strong><strong>Home Services</strong><strong>Equipment Rentals</strong><strong>Mobile Teams</strong></div></section>

  <section className="sv-section"><div className="sv-container"><div className="sv-heading"><span className="sv-kicker">Modular by design</span><h2>Use what you need. Grow into the rest.</h2><p>Every business starts differently. Servonas turns on the workflows that match how you sell.</p></div><div className="sv-module-grid">{modules.map(([t,d],i)=><article key={t}><div className="sv-icon">{String(i+1).padStart(2,"0")}</div><h3>{t}</h3><p>{d}</p><Link href="/features">Explore module →</Link></article>)}</div></div></section>

  <section className="sv-section sv-dark"><div className="sv-container sv-split"><div><span className="sv-kicker">One engine, many industries</span><h2>Sell time, inventory, services—or all three.</h2><p>Servonas adapts to party rentals, equipment rentals, HVAC, landscaping, cleaning, photography, pet services, tutoring, and other local businesses.</p><Link className="sv-button sv-light" href="/industries">See Industries</Link></div><div className="sv-industry-cloud">{["Party rentals","HVAC","Landscaping","Cleaning","Photography","Pet care","Equipment rental","Mobile detailing","Tutoring"].map(x=><span key={x}>{x}</span>)}</div></div></section>

  <section className="sv-section"><div className="sv-container sv-demo-banner"><div><span className="sv-kicker">See it before you sign up</span><h2>Explore a live example business.</h2><p>NRS Party Rentals is the first working proof of the Servonas platform.</p></div><Link className="sv-button" href="/demo">Launch Demo</Link></div></section>

  <section className="sv-section sv-pricing-preview"><div className="sv-container"><div className="sv-heading"><span className="sv-kicker">Simple pricing</span><h2>Start lean. Add power as you grow.</h2></div><div className="sv-price-grid">{[["Starter","$49","For solo operators"],["Growth","$99","For growing teams"],["Business","$199","For advanced operations"]].map(([n,p,s],i)=><article className={i===1?"featured":""} key={n}>{i===1&&<span className="sv-badge">Most popular</span>}<h3>{n}</h3><strong>{p}<small>/month</small></strong><p>{s}</p><ul><li>Online booking</li><li>Payments and deposits</li><li>Customer communication</li><li>Business dashboard</li></ul><Link className="sv-button sv-full" href="/onboarding">Start Free</Link></article>)}</div></div></section>

  <section className="sv-cta"><div className="sv-container"><div><span className="sv-kicker">Build your business on Servonas</span><h2>Create your workspace in minutes.</h2></div><Link className="sv-button sv-light" href="/onboarding">Create Your Business</Link></div></section>
</main>}
