import Link from "next/link";

type CapabilityIconName="customers"|"recurring"|"dispatch"|"schedule"|"booking"|"payments";
const capabilityIconPaths:Record<CapabilityIconName,React.ReactNode>={
 customers:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
 recurring:<><path d="M20 7h-9a4 4 0 0 0-4 4v1"/><path d="m17 4 3 3-3 3M4 17h9a4 4 0 0 0 4-4v-1"/><path d="m7 20-3-3 3-3"/></>,
 dispatch:<><path d="M21 10c0 5-9 12-9 12S3 15 3 10a9 9 0 1 1 18 0Z"/><circle cx="12" cy="10" r="3"/><path d="M8.5 3.7 6 1M15.5 3.7 18 1"/></>,
 schedule:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/><path d="m9 16 2 2 4-4"/></>,
 booking:<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M8 12h3M8 16h5"/><path d="m16 14 1.5 1.5L21 12"/></>,
 payments:<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/><path d="M17 3v4M15 5h4"/></>,
};
function CapabilityIcon({name}:{name:CapabilityIconName}){
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{capabilityIconPaths[name]}</svg>;
}

const capabilities=[
 {icon:"customers" as const,title:"Customer CRM",description:"Keep contacts, service locations, access notes, service history, balances, and recurring plans together."},
 {icon:"recurring" as const,title:"Recurring service",description:"Build repeatable service plans, generate upcoming work, and keep routine customers from falling through the cracks."},
 {icon:"dispatch" as const,title:"Smart dispatch",description:"Assign technicians, visualize the day, calculate road routes, and reduce unnecessary drive time."},
 {icon:"schedule" as const,title:"Jobs & scheduling",description:"Schedule one-time or recurring work and follow every job from intake through completion."},
 {icon:"booking" as const,title:"Online booking",description:"Give customers a branded booking experience with live availability, confirmations, email, and text updates."},
 {icon:"payments" as const,title:"Invoices & payments",description:"Turn completed work into an invoice, collect or record payments, and maintain an accurate customer balance."},
];

const workflow=[
 ["01","Customer requests service"],
 ["02","Servonas schedules the work"],
 ["03","Dispatch optimizes the route"],
 ["04","Technician completes the job"],
 ["05","Invoice and payment follow"],
];

export default function HomePage(){
 return <main className="marketing-home">
  <section className="home-hero">
   <div className="home-hero-glow one"/><div className="home-hero-glow two"/>
   <div className="sv-container home-hero-grid">
    <div className="home-hero-copy">
     <span className="sv-kicker">Field service, finally connected</span>
     <h1>Run every service visit from <span>first call to final payment.</span></h1>
     <p>Servonas brings customers, recurring service plans, scheduling, dispatch, technicians, online booking, invoices, and payments into one field-service operating system.</p>
     <div className="sv-actions"><Link className="sv-button home-primary-cta" href="/signup">Start Free <span aria-hidden="true">→</span></Link><Link className="sv-button sv-secondary" href="/demo">See Servonas in action</Link></div>
     <div className="home-proof"><span>✓ Built for recurring service</span><span>✓ Route-aware dispatch</span><span>✓ One customer record</span></div>
    </div>

    <div className="home-product-preview" aria-label="Example Servonas dispatch workspace">
     <header><div><i/><i/><i/></div><span>Today’s field operations</span><b>Live</b></header>
     <div className="home-preview-body">
      <aside>
       <strong>Tuesday route</strong><small>5 scheduled stops</small>
       {["General Pest","Quarterly Service","Termite Check","Routine Service"].map((job,index)=><div className="home-route-stop" key={job}><em>{index+1}</em><span><b>{job}</b><small>{["9:00 AM · Gilbert","10:20 AM · Gilbert","12:05 PM · Mesa","2:15 PM · Chandler"][index]}</small></span></div>)}
      </aside>
      <div className="home-route-map">
       <span className="map-road road-one"/><span className="map-road road-two"/>
       <span className="route-line line-one"/><span className="route-line line-two"/><span className="route-line line-three"/>
       <b className="map-pin pin-one"><span>1</span></b><b className="map-pin pin-two"><span>2</span></b><b className="map-pin pin-three"><span>3</span></b><b className="map-pin pin-four"><span>4</span></b>
       <div className="route-summary"><small>Optimized day</small><strong>4 stops ready</strong><span>Route and drive time calculated</span></div>
      </div>
     </div>
    </div>
   </div>
  </section>

  <section className="home-workflow" aria-labelledby="workflow-title"><div className="sv-container">
   <div><span className="sv-kicker">One continuous workflow</span><h2 id="workflow-title">The work moves forward without the busywork.</h2></div>
   <ol>{workflow.map(([number,label])=><li key={number}><span>{number}</span><strong>{label}</strong></li>)}</ol>
  </div></section>

  <section className="sv-section home-capabilities"><div className="sv-container">
   <div className="sv-heading"><span className="sv-kicker">Your operation in one place</span><h2>Everything your office and field team need to stay in sync.</h2><p>Each part of Servonas shares the same customer, location, job, employee, and billing information—so your team can act without re-entering data.</p></div>
   <div className="home-capability-grid">{capabilities.map(item=><article key={item.title}><i><CapabilityIcon name={item.icon}/></i><div><h3>{item.title}</h3><p>{item.description}</p></div></article>)}</div>
  </div></section>

  <section className="home-operations"><div className="sv-container home-operations-grid">
   <div>
    <span className="sv-kicker">Built for recurring field service</span>
    <h2>Know who needs service, who is working, and what needs attention.</h2>
    <p>Servonas gives owners and dispatchers a live operating picture—not a collection of disconnected appointments.</p>
    <ul><li><b>Recurring plans</b><span>Generate and manage repeat visits with preserved pricing.</span></li><li><b>Territories and technicians</b><span>Match service locations to the right operating team.</span></li><li><b>Route-aware scheduling</b><span>Sequence flexible service calls around the day’s real geography.</span></li><li><b>Operational alerts</b><span>Surface unassigned work, address problems, conflicts, and failed actions.</span></li></ul>
   </div>
   <div className="home-attention-card">
    <header><div><small>Daily workspace</small><strong>Needs attention</strong></div><span>Today</span></header>
    <article><i className="blue">3</i><div><strong>Unassigned jobs</strong><small>Ready for a technician</small></div><b>Assign →</b></article>
    <article><i className="orange">2</i><div><strong>Pending bookings</strong><small>Waiting for office review</small></div><b>Review →</b></article>
    <article><i className="green">8</i><div><strong>Scheduled today</strong><small>Routes prepared for the field</small></div><b>Dispatch →</b></article>
    <footer><span>Recent activity</span><strong>Job completed · Customer notified</strong><small>Just now</small></footer>
   </div>
  </div></section>

  <section className="sv-section home-audience"><div className="sv-container">
   <div className="sv-heading"><span className="sv-kicker">Made for businesses on the move</span><h2>Designed around real service days.</h2><p>Ideal for teams that visit customer locations, manage recurring work, and need the office and field to operate as one.</p></div>
   <div>{["Pest control","HVAC","Plumbing","Electrical","Lawn & landscape","Pool service","Cleaning services","Mobile service teams"].map(name=><span key={name}>{name}</span>)}</div>
  </div></section>

  <section className="home-final-cta"><div className="sv-container">
   <div><span className="sv-kicker">Ready to run a clearer operation?</span><h2>Build your service business on Servonas.</h2><p>Create your workspace, add your team, and start organizing customers and field work in one place.</p></div>
   <div className="sv-actions"><Link className="sv-button sv-light" href="/signup">Start Free</Link><Link className="home-contact-link" href="/contact">Talk to us →</Link></div>
  </div></section>
 </main>;
}
