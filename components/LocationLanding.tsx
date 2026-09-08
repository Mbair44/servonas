import Link from "next/link";
import {TenantMainWebsiteLink} from "./TenantMainWebsiteLink";

type Page={city:string;state:string|null;h1:string;hero_copy:string;cta_label:string;sections:Array<{heading:string;body:string}>;faqs:Array<{question:string;answer:string}>;schema_json:Record<string,unknown>};
type Business={name:string;phone:string|null;logoUrl?:string|null;primaryColor?:string|null;primary_color?:string|null;services?:Array<{id:string;name:string;description:string|null}>;rentalItems?:Array<{id:string;name:string;description:string|null;imageUrl:string|null;dailyPriceCents:number}>};

export function LocationLanding({page,business,websiteUrl,ctaUrl,nearbyPages=[]}:{page:Page;business:Business;websiteUrl:string;ctaUrl:string;nearbyPages:Array<{slug:string;city:string;state:string|null}>}){
 const offerings=business.rentalItems?.length?business.rentalItems.slice(0,9).map(item=>({...item,image_url:item.imageUrl})):business.services?.slice(0,9)??[];
 return <main className="promotion-landing location-landing" style={{"--promotion-brand":business.primaryColor??business.primary_color??"#1769f5"} as React.CSSProperties}>
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(page.schema_json).replace(/</g,"\\u003c")}}/>
  <header className="promotion-landing-header"><Link href={websiteUrl} className="promotion-brand" aria-label={`${business.name} main website`}>{business.logoUrl?<img src={business.logoUrl} alt={`${business.name} logo`}/>:<i>{business.name.slice(0,1)}</i>}<strong>{business.name}</strong></Link><div>{business.phone&&<a href={`tel:${business.phone}`}>{business.phone}</a>}<a className="promotion-header-cta" href={ctaUrl}>{page.cta_label}</a></div></header>
  <TenantMainWebsiteLink href={websiteUrl} businessName={business.name}/>
  <section className="promotion-hero location-hero"><div><small>Serving {page.city}{page.state?`, ${page.state}`:""}</small><h1>{page.h1}</h1><p>{page.hero_copy}</p><a className="promotion-primary-cta" href={ctaUrl}>{page.cta_label}</a></div></section>
  {offerings.length>0&&<section className="promotion-rentals" id="services"><header><div><small>What we offer</small><h2>Services available in {page.city}</h2></div><b>{offerings.length} option{offerings.length===1?"":"s"}</b></header><div className="promotion-rental-grid">{offerings.map((item:any)=><article className="promotion-rental-card" key={item.id}><div className="promotion-rental-image">{item.image_url?<img src={item.image_url} alt={item.name}/>:<span>{item.name.slice(0,1)}</span>}</div><div><h3>{item.name}</h3>{item.description&&<p className="category-rental-description">{item.description}</p>}<a href={ctaUrl}>{page.cta_label}</a></div></article>)}</div></section>}
  <section className="location-page-content">{(page.sections??[]).map(section=><article key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></article>)}</section>
  <section className="location-page-faq"><header><small>Helpful answers</small><h2>Questions from {page.city} customers</h2></header><div>{(page.faqs??[]).map(faq=><details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</div></section>
  {nearbyPages.length>0&&<nav className="location-page-nearby" aria-label="Nearby service areas"><strong>Nearby areas we serve</strong>{nearbyPages.map(item=><Link href={`/${item.slug}`} key={item.slug}>{item.city}{item.state?`, ${item.state}`:""}</Link>)}</nav>}
  <section className="location-page-final-cta"><h2>Ready to get started in {page.city}?</h2><p>Choose the next step that works for you and connect directly with {business.name}.</p><a className="promotion-primary-cta" href={ctaUrl}>{page.cta_label}</a></section>
 </main>;
}
