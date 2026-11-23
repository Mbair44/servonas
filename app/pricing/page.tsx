import Link from "next/link";
import type { Metadata } from "next";
export const metadata: Metadata={title:"Servonas Pricing | Party-rental software",description:"Straightforward party-rental software plans with a 3% platform fee capped at $99 per billing cycle. Stripe processing fees are additional."};

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
 {name:"Starter",price:"0",icon:"starter",description:"Core rental operations with online payments and a predictable platform-fee cap.",features:["CRM, inventory, calendar, website builder, and online booking","Email notifications","10 staff-created bookings per billing cycle","3% online-payment platform fee, capped at $99 per billing cycle","No SMS, MMS, phone number, or voice calling"]},
 {name:"Growth",price:"50",icon:"growth",description:"For party-rental teams that need messaging and operational automation.",lead:"Everything in Starter, plus:",features:["Unlimited staff-created bookings","SMS/MMS, voice, and booking reminders","Smart Upsells","Existing delivery and route-management tools","3% online-payment platform fee, capped at $99 per billing cycle"],featured:true},
 {name:"Scale",price:"150",icon:"pro",description:"For teams that need the currently available advanced Servonas controls.",lead:"Everything in Growth, plus:",features:["Advanced reporting where configured","Team permissions where configured","3% online-payment platform fee, capped at $99 per billing cycle" ]},
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
 const faqSchema={"@context":"https://schema.org","@type":"FAQPage",mainEntity:[
  {"@type":"Question",name:"Is everything included in one price?",acceptedAnswer:{"@type":"Answer",text:"Yes. Servonas plans include the core office and field tools without per-feature add-ons."}},
  {"@type":"Question",name:"Do I need special hardware?",acceptedAnswer:{"@type":"Answer",text:"No. Servonas works on the phones your field team already uses."}},
  {"@type":"Question",name:"How long is early access free?",acceptedAnswer:{"@type":"Answer",text:"Early access is free while we build and improve Servonas. We will give advance notice before paid billing begins."}}
 ]};
 const productSchema={"@context":"https://schema.org","@type":"Product",name:"Servonas",description:"Party-rental business software.",offers:[0,50,150].map(price=>({"@type":"Offer",priceCurrency:"USD",price,priceSpecification:{"@type":"UnitPriceSpecification",priceCurrency:"USD",price,unitText:"MONTH"}}))};
 return <main className="pricing-page">
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(faqSchema)}}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(productSchema)}}/>
  <section className="pricing-hero"><div className="sv-container">
   <h1>Simple pricing for<br/>party-rental teams.</h1>
   <p>Choose the tools you need. Stripe processing fees are additional to Servonas fees.</p>
  </div></section>

  <section className="sv-container pricing-content">
   <div className="pricing-early-access"><article><i aria-hidden="true"><PricingIcon name="spark"/></i><div><h2>Clear platform-fee cap</h2><p>Eligible online payments carry a 3% Servonas platform fee until the $99 billing-cycle cap is reached. Offline payments do not have a platform fee.</p></div></article></div>

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
     <div className="pricing-price"><s>$59</s><strong>${websiteMaintenancePlan.price}</strong><span>/month planned</span></div>
     <p className="pricing-early-price"><b>FREE right now during Early Access</b></p>
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
    <p className="pricing-early-price"><b>Stripe processing fees are additional.</b></p>
    <div className="pricing-divider"/>
    {plan.lead&&<strong className="pricing-feature-lead">{plan.lead}</strong>}
    <ul>{plan.features.map(feature=><li key={feature}><span>✓</span>{feature}</li>)}</ul>
    <div className="pricing-card-action"><Link className={plan.featured?"sv-button sv-full":"pricing-outline-button"} href="/signup">Get started</Link><small>Existing customers remain on their current plan until explicitly migrated.</small></div>
   </article>)}</div>

   <div className="pricing-assurances">{assurances.map(([icon,title,copy])=><article key={title}><i aria-hidden="true"><PricingIcon name={icon as "contract"|"ownership"|"support"|"service"}/></i><div><strong>{title}</strong><span>{copy}</span></div></article>)}</div>
  </section>

  <section className="pricing-faq"><div className="sv-container"><h2>Frequently asked questions</h2><div>
   <details><summary>How long is early access free?</summary><p>Early access is free while we build and improve Servonas. We’ll give you plenty of notice before paid billing begins.</p></details>
   <details><summary>When will you start charging?</summary><p>We have not set a paid launch date. Founding companies will be notified well in advance and can choose a plan before charges begin.</p></details>
   <details><summary>What if I only want Servonas to maintain my website?</summary><p>We&apos;re planning a website-maintenance-only option at <strong>$29/month</strong> after early access. Right now, it&apos;s still <strong>free during Early Access</strong>, and we&apos;ll notify you well before any website-maintenance billing begins.</p></details>
   <details><summary>Can I change plans later?</summary><p>Yes. You’ll be able to move between plans as your business and team grow.</p></details>
   <details><summary>Is everything included in one price?</summary><p>Yes. Servonas plans include the core office and field tools in one price instead of charging feature by feature.</p></details>
   <details><summary>Do I need special hardware?</summary><p>No. Servonas works on the phones your field team already uses—no special hardware or iPad minis required.</p></details>
  </div></div></section>

  <section className="pricing-bottom-cta"><div className="sv-container"><i aria-hidden="true"><PricingIcon name="cta"/></i><div><h2>Ready to see Servonas in action?</h2><p>Start your free early access today—no credit card required. Compare <Link href="/vs/jobber">Servonas and Jobber</Link>, <Link href="/vs/housecall-pro">Housecall Pro</Link>, or <Link href="/vs/spreadsheets">spreadsheets</Link>.</p></div><Link className="sv-button" href="/signup">Start Free Early Access</Link></div></section>
 </main>;
}
