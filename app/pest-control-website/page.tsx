import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata:Metadata={
 title:"Free Pest Control Website | Servonas",
 description:"We'll build your pest control website for free. Get online booking, scheduling, customers, invoices, payments and more with Servonas.",
 keywords:["pest control website design","pest control web design","pest control website","website for pest control company","pest control website builder"],
 alternates:{canonical:"/pest-control-website"},
};

const included=[
 ["▣","Professional pest control website","A polished website built around your services and brand."],
 ["◫","Mobile-friendly design","A fast experience that works across phones, tablets, and desktops."],
 ["▦","Online booking","Let new and existing customers request or book service online."],
 ["◎","Customer management","Keep customer details, service locations, and history together."],
 ["◷","Scheduling","Organize appointments, technicians, and the work ahead."],
 ["▤","Estimates and invoices","Create estimates and turn completed work into invoices."],
 ["◇","Online payments","Accept secure card payments when your Stripe account is connected."],
 ["▱","Customer texting","Keep customers informed with business messaging tools."],
 ["✓","Job management","Track each job from scheduling through completion."],
];
const attributionKeys=["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","gbraid","wbraid"] as const;

function signupHref(params:Record<string,string|string[]|undefined>){const query=new URLSearchParams({source:"pest-control-website"});for(const key of attributionKeys){const raw=params[key],value=Array.isArray(raw)?raw[0]:raw;if(value)query.set(key,value.slice(0,500));}return `/signup?${query}`;}
function demoHref(params:Record<string,string|string[]|undefined>){const query=new URLSearchParams();for(const key of attributionKeys){const raw=params[key],value=Array.isArray(raw)?raw[0]:raw;if(value)query.set(key,value.slice(0,500));}const suffix=query.toString();return `/demo/pest-control${suffix?`?${suffix}`:""}`;}

export default async function PestControlWebsitePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams,signup=signupHref(params),demo=demoHref(params);
 return <main className="pcw-page">
  <section className="pcw-hero"><div className="pcw-orb pcw-orb-one"/><div className="pcw-orb pcw-orb-two"/><div className="sv-container pcw-hero-grid">
   <div className="pcw-hero-copy"><span className="sv-kicker">Websites for pest control companies</span><h1>We&apos;ll Build Your Pest Control Website. <span>Free.</span></h1><p>Get a professional website built for your pest control business, plus the tools to manage bookings, customers, scheduling, invoices, payments, and more.</p><div className="sv-actions"><Link className="sv-button pcw-primary" href={signup}>Build My Free Website <span aria-hidden="true">→</span></Link><Link className="sv-button sv-secondary" href={demo}>View Example Website</Link></div><div className="pcw-hero-proof"><span>✓ Built for small pest businesses</span><span>✓ Mobile friendly</span><span>✓ No existing website needed</span></div></div>
   <div className="pcw-hero-visual"><div className="pcw-photo"><Image src="/images/pest-control-technician-spraying.png" alt="Pest control professional treating the exterior of a customer's home" fill priority sizes="(max-width: 900px) 100vw, 46vw"/></div><div className="pcw-site-preview"><span>YOUR NEW WEBSITE</span><strong>Professional. Local. Ready to book.</strong><small>Website + business tools, connected from day one.</small></div><div className="pcw-free-badge"><b>FREE</b><span>pilot website build</span></div></div>
  </div></section>

  <section className="pcw-pilot"><div className="sv-container"><span aria-hidden="true">★</span><div><h2>A limited Servonas pilot offer</h2><p>We&apos;re looking for a limited number of pest control companies to join the Servonas pilot. We&apos;ll build your website at no cost and give you access to the tools you need to run your business.</p></div></div></section>

  <section className="sv-section pcw-included" id="included"><div className="sv-container"><div className="sv-heading"><span className="sv-kicker">More than a website</span><h2>Everything you need to get online—and get organized.</h2><p>Your site brings in the request. Servonas helps you handle what happens next.</p></div><div className="pcw-included-grid">{included.map(([icon,title,description])=><article key={title}><i aria-hidden="true">{icon}</i><div><h3>{title}</h3><p>{description}</p></div></article>)}</div></div></section>

  <section className="pcw-how"><div className="sv-container"><div className="sv-heading"><span className="sv-kicker">How it works</span><h2>From idea to taking bookings in three steps.</h2></div><ol>{[["01","Tell Us About Your Business","Create your Servonas account and give us the basics about your pest control company."],["02","We Build Your Website","Servonas helps create a professional website tailored to your pest control business."],["03","Start Booking Jobs","Publish the site and manage customers, schedules, jobs, invoices, and payments from Servonas."]].map(([number,title,body])=><li key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></li>)}</ol></div></section>

  <section className="pcw-connected"><div className="sv-container pcw-connected-grid"><div><span className="sv-kicker">Website meets operations</span><h2>Your Website Should Do More Than Look Good</h2><p>Traditional web design often stops when the site goes live. Servonas connects your website to the work behind your pest control business.</p><p>When a customer books or requests service, their information is available inside Servonas so you can manage the customer, schedule the job, complete the work, and handle billing without re-entering the same details in disconnected tools.</p></div><div className="pcw-flow"><div><i>1</i><span><strong>Customer books online</strong><small>From your branded pest control website</small></span></div><b aria-hidden="true">↓</b><div><i>2</i><span><strong>Details flow into Servonas</strong><small>Customer and service request stay connected</small></span></div><b aria-hidden="true">↓</b><div><i>3</i><span><strong>You run the job</strong><small>Schedule, complete, invoice, and collect</small></span></div></div></div></section>
  <section className="pcw-demo-callout"><div className="sv-container"><div className="pcw-demo-browser"><header><i/><i/><i/><span>desertshield.example</span></header><div><span>DESERT SHIELD PEST CONTROL</span><h2>Protect Your Home From Unwanted Guests</h2><p>See the polished, mobile-friendly pest-control website experience Servonas can create.</p></div></div><div><span className="sv-kicker">See what we can build for you</span><h2>Preview an example pest-control website built with Servonas.</h2><p>Explore the services, trust sections, booking experience, and local-business presentation before creating an account.</p><Link className="sv-button" href={demo}>View Example Website</Link></div></div></section>

  <section className="sv-section pcw-audience"><div className="sv-container"><div className="sv-heading"><span className="sv-kicker">Built for businesses getting started</span><h2>A simpler foundation for your pest control company.</h2><p>Especially useful for owner-operators and small teams currently coordinating work through calls, spreadsheets, calendars, or several separate apps.</p></div><div><span>New pest control companies</span><span>Owner-operators</span><span>Small local teams</span><span>Growing service businesses</span></div></div></section>

  <section className="pcw-faq"><div className="sv-container"><div className="sv-heading"><span className="sv-kicker">Frequently asked questions</span><h2>What to know before you start.</h2></div><div className="pcw-faq-list"><details><summary>Is the website really free?</summary><p>Servonas is currently offering website creation at no cost to selected pest control companies participating in the pilot. The offer is limited and pilot participation is subject to availability.</p></details><details><summary>Do I need an existing website?</summary><p>No. You can start without an existing website and build your business presence through Servonas.</p></details><details><summary>Can customers book online?</summary><p>Yes. Your website can use Servonas online booking so customers can request or book service based on the options you enable.</p></details><details><summary>Can I use my own domain?</summary><p>Yes. Servonas supports connecting a domain you already own. You&apos;ll update the required DNS records with your domain provider, and the connection includes automatic HTTPS after verification.</p></details><details><summary>What happens after someone books?</summary><p>The customer and booking information becomes available in Servonas, where you can manage the customer, schedule and track the job, and continue through invoicing and payment.</p></details></div></div></section>

  <section className="home-final-cta pcw-final"><div className="sv-container"><div><span className="sv-kicker">Limited pilot availability</span><h2>Ready to Get Your Pest Control Business Online?</h2><p>We&apos;ll build your website for free and give you the tools to run your business.</p></div><Link className="sv-button sv-light" href={signup}>Build My Free Website</Link></div></section>
 </main>;
}
