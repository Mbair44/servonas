import Link from "next/link";
const industries=[
["Event & party rentals","Inventory quantities, galleries, blocked dates, delivery, deposits, and pickup."],
["Equipment rentals","Track availability, utilization, customer bookings, and item quantities."],
["Home services","Collect requests, schedule jobs, communicate with customers, and take payment."],
["Mobile services","Coordinate appointments, travel windows, technicians, and customer updates."],
["Appointment businesses","Sell bookable time, classes, consultations, and recurring services."],
["Creative professionals","Package services, take retainers, manage dates, and share receipts."]];
export default function Industries(){return <main><section className="sv-page-hero"><div className="sv-container"><span className="sv-kicker">Solutions</span><h1>One flexible engine for businesses that sell time, work, or inventory.</h1><p>Choose the modules that match your business model instead of forcing your operation into a rigid template.</p></div></section><section className="sv-section"><div className="sv-container sv-module-grid">{industries.map(([n,d],i)=><article key={n}><div className="sv-icon">{String(i+1).padStart(2,"0")}</div><h2>{n}</h2><p>{d}</p></article>)}</div></section><section className="sv-cta"><div className="sv-container"><h2>Tell Servonas how your business works.</h2><Link className="sv-button sv-light" href="/onboarding">Create Your Business</Link></div></section></main>}
