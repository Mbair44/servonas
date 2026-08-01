import Link from "next/link";

const plans=[
 {name:"Starter",price:"40",icon:"➤",description:"Everything you need to get organized and run your business efficiently.",features:["Unlimited customers & jobs","AI receptionist & call handling","Online booking & forms","Scheduling & dispatch","Estimates & proposals","Invoicing & payments","Mobile app for technicians","Basic reporting","Email & text communications","Up to 5 users"]},
 {name:"Growth",price:"75",icon:"↗",description:"Advanced tools to help you grow, automate, and run smarter.",lead:"Everything in Starter, plus:",features:["AI follow-ups & review requests","Technician GPS & live tracking","Advanced scheduling rules","Route optimization","Memberships & maintenance plans","Inventory management","QuickBooks Online sync","Advanced reporting & dashboards","Up to 15 users"],featured:true},
 {name:"Pro",price:"125",icon:"♛",description:"For established businesses that want power, control, and scale.",lead:"Everything in Growth, plus:",features:["Multi-location support","Advanced permissions & roles","Custom workflows & automations","API access","Custom reports","Priority support","Up to 30 users"]},
];

const assurances=[
 ["◇","No long-term contracts","Cancel anytime."],
 ["▣","Your data is yours","We’ll never lock you in."],
 ["◉","Real human support","We’re here when you need us."],
 ["↗","Built for service pros","By people who get it."],
];

export default function Pricing(){
 return <main className="pricing-page">
  <section className="pricing-hero"><div className="sv-container">
   <h1>Simple pricing.<br/>Powerful everything.</h1>
   <p>Everything you need to run and grow your service business—in one platform.</p>
  </div></section>

  <section className="sv-container pricing-content">
   <div className="pricing-early-access">
    <article><i aria-hidden="true">★</i><div><h2>Early Access — Free While We Build</h2><p>Servonas is currently available free to a limited number of service businesses while we’re in early access.</p><p>You won’t be charged during the early-access period, and we’ll let you know well in advance before paid billing begins.</p></div></article>
    <article><i aria-hidden="true">♧</i><div><h2>Founding Service Companies</h2><p>Join early and get full access during early access at no cost and <strong>50% off</strong> your selected plan for the first year when paid plans launch.</p></div></article>
   </div>

   <div className="pricing-grid">{plans.map(plan=><article className={plan.featured?"pricing-card featured":"pricing-card"} key={plan.name}>
    {plan.featured&&<span className="pricing-popular">Most popular</span>}
    <header><i aria-hidden="true">{plan.icon}</i><h2>{plan.name}</h2></header>
    <p className="pricing-description">{plan.description}</p>
    <div className="pricing-price"><strong>${plan.price}</strong><span>/month</span></div>
    <p className="pricing-early-price"><s>${Number(plan.price)*2}/month</s><b>FREE during Early Access</b></p>
    <div className="pricing-divider"/>
    {plan.lead&&<strong className="pricing-feature-lead">{plan.lead}</strong>}
    <ul>{plan.features.map(feature=><li key={feature}><span>✓</span>{feature}</li>)}</ul>
    <div className="pricing-card-action"><Link className={plan.featured?"sv-button sv-full":"pricing-outline-button"} href="/signup">Start Free Early Access</Link><small>No credit card required</small></div>
   </article>)}</div>

   <div className="pricing-assurances">{assurances.map(([icon,title,copy])=><article key={title}><i aria-hidden="true">{icon}</i><div><strong>{title}</strong><span>{copy}</span></div></article>)}</div>
  </section>

  <section className="pricing-faq"><div className="sv-container"><h2>Frequently asked questions</h2><div>
   <details><summary>How long is early access free?</summary><p>Early access is free while we build and improve Servonas. We’ll give you plenty of notice before paid billing begins.</p></details>
   <details><summary>When will you start charging?</summary><p>We have not set a paid launch date. Founding companies will be notified well in advance and can choose a plan before charges begin.</p></details>
   <details><summary>Can I change plans later?</summary><p>Yes. You’ll be able to move between plans as your business and team grow.</p></details>
  </div></div></section>

  <section className="pricing-bottom-cta"><div className="sv-container"><i aria-hidden="true">▦</i><div><h2>Ready to see Servonas in action?</h2><p>Start your free early access today—no credit card required.</p></div><Link className="sv-button" href="/signup">Start Free Early Access</Link></div></section>
 </main>;
}
