import type {Metadata} from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata:Metadata={title:"Desert Shield Pest Control | Servonas Website Demo",description:"A fictional pest-control website example created to demonstrate Servonas website capabilities.",robots:{index:false,follow:true}};

const services=[
 {icon:"DS",name:"General Pest Control",body:"Routine protection for common pests around your home and yard."},
 {icon:"SC",name:"Scorpion Control",body:"Targeted exterior and entry-point treatments for desert homes."},
 {icon:"TM",name:"Termite Control",body:"Inspections and straightforward treatment recommendations."},
 {icon:"RD",name:"Rodent Control",body:"Help identifying entry points and protecting the property."},
 {icon:"MS",name:"Mosquito Control",body:"Seasonal outdoor treatments for more comfortable evenings."},
 {icon:"CM",name:"Commercial Pest Control",body:"Practical plans for offices, storefronts, and local properties."},
];

const pests=[
 "Ants",
 "Scorpions",
 "Roaches",
 "Spiders",
 "Rodents",
 "Termites",
 "Mosquitoes",
 "Wasps",
];

const trustItems=[
 "Local pest professionals",
 "Family-conscious treatments",
 "Clear pricing",
 "Convenient scheduling",
 "Fast response",
];

const whyItems=[
 ["Local knowledge","Service designed around common Southwest pest concerns."],
 ["Clear recommendations","Know what we are treating and what we recommend before service begins."],
 ["Property-conscious treatment","Thoughtful recommendations designed around your home and property."],
 ["Easy communication","Straightforward scheduling and helpful service updates."],
];

const processSteps=[
 ["1","Tell us what you need","Choose a service and tell us what you are seeing."],
 ["2","We handle the service","A pest professional completes the recommended treatment."],
 ["3","Get clear next steps","Receive straightforward follow-up information and ongoing options."],
];

const reviews=[
 ["Jamie R. — fictional","The quote request felt simple, and the service options were easy to understand."],
 ["Morgan T. — fictional","Everything from scheduling to follow-up felt clear and well organized."],
 ["Casey L. — fictional","It looked like a real local company website, and booking felt straightforward."],
];

const serviceAreas=["Gilbert","Chandler","Mesa","Queen Creek","Nearby East Valley communities"];
const attributionKeys=["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","gbraid","wbraid"] as const;

export default async function PestControlDemo({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 const query=new URLSearchParams({source:"pest-control-website",utm_content:"pest_demo"});
 for(const key of attributionKeys){
  const raw=params[key],value=Array.isArray(raw)?raw[0]:raw;
  if(value)query.set(key,value.slice(0,500));
 }

 return <main className="pest-demo">
  <aside className="pest-demo-banner"><span>This is an example website built with Servonas.</span><Link href={`/signup?${query}`}>Get One For My Business — Free</Link></aside>

  <header className="pest-demo-nav">
   <a href="#top" className="pest-demo-brand"><i>DS</i><span><strong>Desert Shield</strong><small>Pest Control</small></span></a>
   <nav><a href="#pests">Pests</a><a href="#services">Services</a><a href="#areas">Service area</a><a href="#contact">Contact</a></nav>
   <a className="pest-demo-button pest-demo-button-quiet" href="#booking">Book Online</a>
  </header>

  <section className="pest-demo-hero" id="top">
   <div>
    <span>LOCAL PEST CONTROL · EAST VALLEY</span>
    <h1>Pest Control for Gilbert, Chandler &amp; the East Valley</h1>
    <p>Reliable local pest control for ants, scorpions, roaches, spiders, rodents, termites, mosquitoes, and more across Gilbert, Chandler, Mesa, Queen Creek, and nearby East Valley communities.</p>
    <div className="pest-demo-hero-actions"><a className="pest-demo-button" href="#contact-cta">Get a Free Quote</a><a className="pest-demo-secondary" href="#booking">Book Online</a></div>
    <small>Fictional demonstration business · No real services are offered</small>
   </div>
   <div className="pest-demo-photo">
    <Image src="/images/pest-control-technician-spraying.png" alt="Pest control technician treating the outside of a home" fill priority sizes="(max-width: 900px) 100vw, 50vw"/>
    <div><b>Local help, without the runaround.</b><span>Clear service options. Convenient scheduling. East Valley-focused coverage.</span></div>
   </div>
  </section>

  <section className="pest-demo-trust" aria-label="Trust highlights">{trustItems.map(item=><span key={item}><i aria-hidden="true">✓</i>{item}</span>)}</section>

  <section className="pest-demo-section pest-demo-pests" id="pests">
   <header><span>PESTS WE TREAT</span><h2>Common pest problems we can help with.</h2><p>See at a glance whether Desert Shield handles the pest issue you are dealing with.</p></header>
   <div className="pest-demo-pest-grid">{pests.map((pest,index)=><article key={pest}><i aria-hidden="true">{String(index+1).padStart(2,"0")}</i><h3>{pest}</h3><p>Fast local service options for typical East Valley pest concerns.</p></article>)}</div>
  </section>

  <section className="pest-demo-section" id="services">
   <header><span>PEST CONTROL SERVICES</span><h2>Protection built around your property.</h2><p>Choose the service that matches what is happening now, then get help deciding on the right next step.</p></header>
   <div className="pest-demo-services">{services.map(service=><article key={service.name}><i aria-hidden="true">{service.icon}</i><h3>{service.name}</h3><p>{service.body}</p><a href="#booking">Book this service →</a></article>)}</div>
  </section>

  <section className="pest-demo-why" id="why">
   <div><span>WHY DESERT SHIELD</span><h2>Pest control that feels clear, local, and easy to act on.</h2><p>Built to show how a premium local-service website can explain the problem, build trust, and make the next step obvious.</p></div>
   <ul>{whyItems.map(([title,body])=><li key={title}><b>{title}</b><span>{body}</span></li>)}</ul>
  </section>

  <section className="pest-demo-reviews">
   <header><span>DEMONSTRATION REVIEWS</span><h2>What the customer experience could feel like.</h2><p>These sample reviews are fictional and shown only to demonstrate website design.</p></header>
   <div>{reviews.map(([name,quote])=><blockquote key={name}><b>★★★★★</b><p>“{quote}”</p><cite>{name}</cite></blockquote>)}</div>
  </section>

  <section className="pest-demo-areas" id="areas">
   <div><span>SERVICE AREA</span><h2>Serving the East Valley</h2><p>Local pest-control service for communities throughout the East Valley and surrounding areas.</p><small>Demo service area · Contact a real provider for availability</small></div>
   <div className="pest-demo-area-grid">{serviceAreas.map(area=><span key={area}>{area}</span>)}</div>
  </section>

  <section className="pest-demo-process">
   <header><span>HOW IT WORKS</span><h2>Simple next steps from problem to plan.</h2></header>
   <ol>{processSteps.map(([number,title,body],index)=><li key={number}><i>{number}</i><h3>{title}</h3><p>{body}</p>{index<processSteps.length-1?<b aria-hidden="true">→</b>:null}</li>)}</ol>
  </section>

  <section className="pest-demo-final-cta" id="contact-cta">
   <div><span>READY TO TAKE CARE OF THE PROBLEM?</span><h2>Tell us what you are seeing and we&apos;ll help you choose the right next step.</h2><p>Start with a quote request or go straight to the demo-safe online booking flow.</p></div>
   <div className="pest-demo-final-actions"><a className="pest-demo-button" href="#booking">Get a Free Quote</a><a className="pest-demo-secondary pest-demo-secondary-dark" href="#booking">Book Online</a></div>
  </section>

  <section className="pest-demo-about" id="about">
   <div><span>ABOUT THIS EXAMPLE</span><h2>A polished fictional website built to feel like a real local service business.</h2><p>Desert Shield Pest Control is a fictional Southwest pest-control company created to show the kind of premium website Servonas can build. A real Servonas website uses the business&apos;s own story, services, branding, service areas, and contact details.</p></div>
   <aside><strong>Fictional demonstration business.</strong><span>No real services are offered, and demo reviews are not from real customers.</span></aside>
  </section>

  <section className="pest-demo-booking" id="booking">
   <div><span>BOOK ONLINE</span><h2>Tell us how we can help.</h2><p>This safe demonstration form does not submit or create an appointment.</p></div>
   <form><label>Service<select defaultValue=""><option value="" disabled>Choose a pest-control service</option>{services.map(service=><option key={service.name}>{service.name}</option>)}</select></label><label>Preferred day<input type="date"/></label><label>What are you seeing?<textarea rows={3} placeholder="Tell us about the pest issue"/></label><button type="button" className="pest-demo-button">Preview Booking</button><small>Demonstration only — no information is sent.</small></form>
  </section>

  <footer className="pest-demo-footer" id="contact">
   <div><strong>Desert Shield Pest Control</strong><p>Fictional pest-control website demonstration for East Valley service businesses.</p></div>
   <div><b>Services</b><a href="#services">General pest control</a><a href="#services">Termite control</a><a href="#services">Rodent control</a></div>
   <div><b>Service area</b><span>Gilbert</span><span>Chandler</span><span>East Valley</span></div>
   <small>Powered by <Link href="/pest-control-website">Servonas</Link></small>
  </footer>

  <div className="pest-demo-sticky-cta" aria-label="Quick actions"><a className="pest-demo-secondary pest-demo-sticky-secondary" href="#booking">Book Online</a><a className="pest-demo-button" href="#contact-cta">Get a Quote</a></div>
 </main>;
}
