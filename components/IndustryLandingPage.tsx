import Image from "next/image";
import Link from "next/link";

export type IndustryLandingConfig={
 industry:string;kicker:string;headline:string;accent:string;description:string;
 proof:string[];features:{title:string;description:string}[];workflow:string[];
 heroImage?:{src:string;alt:string};
};

export function IndustryLandingPage({config}:{config:IndustryLandingConfig}){
 return <main className="marketing-home industry-landing">
  <section className="home-hero"><div className="home-hero-glow one"/><div className="home-hero-glow two"/><div className="sv-container industry-hero-grid"><div className="home-hero-copy"><span className="sv-kicker">{config.kicker}</span><h1>{config.headline} <span>{config.accent}</span></h1><p>{config.description}</p><div className="sv-actions"><Link className="sv-button home-primary-cta" href="/signup">Start Free <span aria-hidden="true">→</span></Link><Link className="sv-button sv-secondary" href="/demo">See Servonas in action</Link></div><div className="home-proof">{config.proof.map(item=><span key={item}>✓ {item}</span>)}</div></div><aside className={`industry-hero-card${config.heroImage?" has-image":""}`}>{config.heroImage&&<div className="industry-hero-photo"><Image src={config.heroImage.src} alt={config.heroImage.alt} fill priority sizes="(max-width: 1000px) 100vw, 42vw"/></div>}<span>Built for {config.industry}</span><h2>Your day, organized.</h2>{config.workflow.slice(0,4).map((item,index)=><div key={item}><i>{index+1}</i><strong>{item}</strong><b>Ready</b></div>)}</aside></div></section>
  <section className="home-workflow"><div className="sv-container"><div><span className="sv-kicker">One connected workflow</span><h2>From the first request through payment.</h2></div><ol>{config.workflow.map((item,index)=><li key={item}><span>{String(index+1).padStart(2,"0")}</span><strong>{item}</strong></li>)}</ol></div></section>
  <section className="sv-section home-capabilities"><div className="sv-container"><div className="sv-heading"><span className="sv-kicker">{config.industry} operations</span><h2>Software shaped around the way your business actually works.</h2><p>Keep customers, schedules, field work, communication, and billing in one shared system.</p></div><div className="home-capability-grid">{config.features.map((feature,index)=><article key={feature.title}><i>{String(index+1).padStart(2,"0")}</i><div><h3>{feature.title}</h3><p>{feature.description}</p></div></article>)}</div></div></section>
  <section className="home-final-cta"><div className="sv-container"><div><span className="sv-kicker">Ready to simplify your operation?</span><h2>Run your {config.industry.toLowerCase()} business with Servonas.</h2><p>Start your workspace and bring the office, field team, and customer experience together.</p></div><div className="sv-actions"><Link className="sv-button sv-light" href="/signup">Start Free</Link><Link className="home-contact-link" href="/contact">Talk to us →</Link></div></div></section>
 </main>;
}
