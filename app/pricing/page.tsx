import Link from "next/link";

function PricingIcon({name,className}:{name:"starter"|"growth"|"pro"|"website"|"contract"|"ownership"|"support"|"service"|"spark"|"founding"|"cta";className?:string}){
 const cls=className?`pricing-icon ${className}`:"pricing-icon";
 switch(name){
  case "starter":
   return <svg className={cls} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h9"/><path d="m12 8 4 4-4 4"/><path d="M4 5h16v14H4z"/></svg>;
  case "growth":
   return <svg className={cls} viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"/><path d="M10 7h7v7"/><path d="M7 7v10h10"/></svg>;
  case "pro":
   return <svg className={cls} viewBox="0 0 24 24" aria-hidden="true"><path d="m5 8 3 3 4-5 4 5 3-3v8H5z"/><path d="M8 18h8"/></svg>;
  case "website":
   return <svg className={cls} viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="12" rx="2"/><path d="M8 19h8"/><path d="M9 9h6"/><path d="M9 12h4"/></svg>;
  case "contract":
   return <svg className={cls} viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8"/><path d="m16 8-8 8"/><rect x="5" y="5" width="14" height="14" rx="3"/></svg>;
  case "ownership":
   return <svg className={cls} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 5 8v8l7 4 7-4V8z"/><path d="m12 4 7 4"/><path d="m12 4-7 4"/><path d="M12 12v8"/></svg>;
  case "support":
   return <svg className={cls} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12a7 7 0 0 1 14 0"/><rect x="4" y="12" width="3" height="5" rx="1.5"/><rect x="17" y="12" width="3" height="5" rx="1.5"/><path d="M9 19c.8.6 1.8 1 3 1 1.1 0 2-.3 2.8-.9"/></svg>;
  case "service":
   return <svg className={cls} viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17 17 6"/><path d="M9 6h8v8"/><path d="M7 7h4"/><path d="M7 11v6h6"/></svg>;
  case "spark":
   return <svg className={cls} viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 1.8 4.2L18 10l-4.2 1.8L12 16l-1.8-4.2L6 10l4.2-1.8z"/></svg>;
  case "founding":
   return <svg className={cls} viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h8"/><path d="M7 10h10"/><path d="m8 4 1 3"/><path d="m16 4-1 3"/><path d="M7 10v3c0 2.8 2.2 5 5 5s5-2.2 5-5v-3"/><path d="M10 20h4"/></svg>;
  case "cta":
   return <svg className={cls} viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9h8"/><path d="M8 12h8"/><path d="M8 15h5"/></svg>;
 }
}

const plans=[
 {name:"Starter",price:"40",icon:"starter",description:"Everything you need to get organized and run your business efficiently.",features:["Unlimited customers & jobs","AI receptionist & call handling","Online booking & forms","Scheduling & dispatch","Estimates & proposals","Invoicing & payments","Mobile app for technicians","Basic reporting","Email & text communications","Up to 5 users"]},
 {name:"Growth",price:"75",icon:"growth",description:"Advanced tools to help you grow, automate, and run smarter.",lead:"Everything in Starter, plus:",features:["AI follow-ups & review requests","Technician GPS & live tracking","Advanced scheduling rules","Route optimization","Memberships & maintenance plans","Inventory management","QuickBooks Online sync","Advanced reporting & dashboards","Up to 15 users"],featured:true},
 {name:"Pro",price:"125",icon:"pro",description:"For established businesses that want power, control, and scale.",lead:"Everything in Growth, plus:",features:["Multi-location support","Advanced permissions & roles","Custom workflows & automations","API access","Custom reports","Priority support","Up to 30 users"]},
];

const websiteMaintenancePlan={
 name:"Website Maintenance Only",
 price:"29",
 icon:"website",
 description:"For businesses that only want Servonas to keep a Servonas-built website live, secure, and up to date.",
 features:["Hosting and uptime monitoring","Routine website updates","Security and SSL upkeep","Basic content and contact-detail changes","Support for your Servonas website address or connected domain"],
};

const assurances=[
 ["contract","No long-term contracts","Cancel anytime."],
 ["ownership","Your data is yours","We’ll never lock you in."],
 ["support","Real human support","We’re here when you need us."],
 ["service","Built for service pros","By people who get it."],
];

export default function Pricing(){
 return <main className="pricing-page">
  <section className="pricing-hero"><div className="sv-container">
   <h1>Simple pricing.<br/>Powerful everything.</h1>
   <p>Everything you need to run and grow your service business—in one platform.</p>
  </div></section>

  <section className="sv-container pricing-content">
   <div className="pricing-early-access">
    <article><i aria-hidden="true"><PricingIcon name="spark"/></i><div><h2>Early Access — Free While We Build</h2><p>Servonas is currently available free to a limited number of service businesses while we’re in early access.</p><p>You won’t be charged during the early-access period, and we’ll let you know well in advance before paid billing begins.</p></div></article>
    <article><i aria-hidden="true"><PricingIcon name="founding"/></i><div><h2>Founding Service Companies</h2><p>Join early and get full access during early access at no cost and <strong>50% off</strong> your selected plan for the first year when paid plans launch.</p></div></article>
   </div>

   <section className="pricing-website-maintenance" aria-label="Website maintenance pricing">
    <div className="pricing-website-maintenance-copy">
     <span className="sv-kicker">Website-only option</span>
     <h2>Just want us to maintain your website?</h2>
     <p>We&apos;re planning a website-maintenance-only option for businesses that want Servonas to keep their Servonas-built website live and maintained without the full operations platform.</p>
     <p className="pricing-maintenance-benchmark">Comparable small-business website care plans often start around <strong>$49–$89/month</strong>, so our planned entry point is designed to stay competitive while still covering ongoing upkeep.</p>
    </div>
    <article className="pricing-card pricing-card-maintenance">
     <header><i aria-hidden="true"><PricingIcon name={websiteMaintenancePlan.icon as "website"}/></i><h2>{websiteMaintenancePlan.name}</h2></header>
     <p className="pricing-description">{websiteMaintenancePlan.description}</p>
     <div className="pricing-price"><strong>${websiteMaintenancePlan.price}</strong><span>/month planned</span></div>
     <p className="pricing-early-price"><s>${websiteMaintenancePlan.price}/month</s><b>FREE right now during Early Access</b></p>
     <div className="pricing-divider"/>
     <ul>{websiteMaintenancePlan.features.map(feature=><li key={feature}><span>✓</span>{feature}</li>)}</ul>
     <div className="pricing-card-action"><Link className="pricing-outline-button" href="/signup">Start Free Early Access</Link><small>No charge right now. We&apos;ll give advance notice before website-maintenance billing begins.</small></div>
    </article>
   </section>

   <div className="workspace-notice success pricing-website-callout">
    Want Servonas to just maintain your website? See the <strong>Website Maintenance Only</strong> option above. It&apos;s planned at <strong>$29/month</strong> and <strong>free right now during Early Access</strong>.
   </div>

   <div className="pricing-grid">{plans.map(plan=><article className={plan.featured?"pricing-card featured":"pricing-card"} key={plan.name}>
    {plan.featured&&<span className="pricing-popular">Most popular</span>}
    <header><i aria-hidden="true"><PricingIcon name={plan.icon as "starter"|"growth"|"pro"}/></i><h2>{plan.name}</h2></header>
    <p className="pricing-description">{plan.description}</p>
    <div className="pricing-price"><strong>${plan.price}</strong><span>/month</span></div>
    <p className="pricing-early-price"><s>${Number(plan.price)*2}/month</s><b>FREE during Early Access</b></p>
    <div className="pricing-divider"/>
    {plan.lead&&<strong className="pricing-feature-lead">{plan.lead}</strong>}
    <ul>{plan.features.map(feature=><li key={feature}><span>✓</span>{feature}</li>)}</ul>
    <div className="pricing-card-action"><Link className={plan.featured?"sv-button sv-full":"pricing-outline-button"} href="/signup">Start Free Early Access</Link><small>No credit card required</small></div>
   </article>)}</div>

   <div className="pricing-assurances">{assurances.map(([icon,title,copy])=><article key={title}><i aria-hidden="true"><PricingIcon name={icon as "contract"|"ownership"|"support"|"service"}/></i><div><strong>{title}</strong><span>{copy}</span></div></article>)}</div>
  </section>

  <section className="pricing-faq"><div className="sv-container"><h2>Frequently asked questions</h2><div>
   <details><summary>How long is early access free?</summary><p>Early access is free while we build and improve Servonas. We’ll give you plenty of notice before paid billing begins.</p></details>
   <details><summary>When will you start charging?</summary><p>We have not set a paid launch date. Founding companies will be notified well in advance and can choose a plan before charges begin.</p></details>
   <details><summary>What if I only want Servonas to maintain my website?</summary><p>We&apos;re planning a website-maintenance-only option at <strong>$29/month</strong> after early access. Right now, it&apos;s still <strong>free during Early Access</strong>, and we&apos;ll notify you well before any website-maintenance billing begins.</p></details>
   <details><summary>Can I change plans later?</summary><p>Yes. You’ll be able to move between plans as your business and team grow.</p></details>
  </div></div></section>

  <section className="pricing-bottom-cta"><div className="sv-container"><i aria-hidden="true"><PricingIcon name="cta"/></i><div><h2>Ready to see Servonas in action?</h2><p>Start your free early access today—no credit card required.</p></div><Link className="sv-button" href="/signup">Start Free Early Access</Link></div></section>
 </main>;
}
