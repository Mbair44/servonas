import Link from "next/link";
const groups=[
["Booking & sales",["Online booking","Live availability","Quotes and deposits","Coupons and refunds","Multi-item checkout"]],
["Operations",["Scheduling","Blocked dates","Quantity inventory","Delivery windows","Admin dashboard"]],
["Customer experience",["Receipts","SMS reminders","Review requests","Customer history","Branded websites"]],
["Growth",["Analytics foundation","SEO-ready pages","Image galleries","Upsell-ready catalog","AI-ready workflows"]]
];
export default function Features(){return <main><section className="sv-page-hero"><div className="sv-container"><span className="sv-kicker">Product</span><h1>Everything between the first click and the completed job.</h1><p>Servonas connects the customer-facing experience to the operational work behind it.</p></div></section><section className="sv-section"><div className="sv-container sv-feature-groups">{groups.map(([name,items])=><article key={name as string}><h2>{name}</h2><ul>{(items as string[]).map(x=><li key={x}>✓ {x}</li>)}</ul></article>)}</div></section><section className="sv-cta"><div className="sv-container"><h2>Configure Servonas around your business.</h2><Link className="sv-button sv-light" href="/onboarding">Start Free</Link></div></section></main>}
