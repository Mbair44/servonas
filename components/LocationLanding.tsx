import Link from "next/link";
import styles from "./LocationLanding.module.css";

type Page={city:string;state:string|null;h1:string;hero_copy:string;cta_label:string;sections:Array<{heading:string;body:string}>;faqs:Array<{question:string;answer:string}>;schema_json:Record<string,unknown>};
type Review={author:string;rating:number;text:string;publishedAt?:string|null};
type RentalItem={id:string;name:string;category?:string|null;description:string|null;imageUrl:string|null;dailyPriceCents:number};
type Business={
 name:string;phone:string|null;logoUrl?:string|null;primaryColor?:string|null;primary_color?:string|null;
 industryProfile?:string|null;bookingEnabled?:boolean;requestEnabled?:boolean;googleRating?:number|null;googleReviewCount?:number|null;
 googleReviews?:Review[];photoUrls?:string[];serviceAreas?:string[];
 services?:Array<{id:string;name:string;description:string|null}>;rentalItems?:RentalItem[];
};

const industryLabels:Record<string,string>={party_rental:"Party Rentals",plumbing:"Plumbing Services",pest_control:"Pest Control",hvac:"HVAC Services",landscaping:"Landscaping Services",cleaning:"Cleaning Services",junk_removal:"Junk Removal",car_detailing:"Auto Detailing",power_washing:"Power Washing"};

function primaryOffering(business:Business){
 const configuredCategory=business.rentalItems?.find(item=>item.category?.trim())?.category?.trim();
 return configuredCategory||business.services?.find(service=>service.name.trim())?.name.trim()||industryLabels[business.industryProfile??""]||"Local Services";
}

function locationHeading(business:Business,city:string,state:string|null){
 const offering=primaryOffering(business),place=`${city}${state?`, ${state}`:""}`;
 if(business.industryProfile==="party_rental"){
  if(/party rentals?/i.test(offering))return `${offering} in ${place}`;
  if(/bounce house/i.test(offering))return `Bounce House & Party Rentals in ${place}`;
  return `${offering} & Party Rentals in ${place}`;
 }
 return `${offering} in ${place}`;
}

function conversionLabel(business:Business,ctaUrl:string){
 const bookingEnabled=business.bookingEnabled??/\/(book|booking)(?:\/|$|\?)/.test(ctaUrl);
 if(!bookingEnabled)return "Get a Quote";
 return business.industryProfile==="party_rental"?"Check Availability":"Schedule Service";
}

function offeringsHeading(business:Business,city:string){
 const offering=primaryOffering(business);
 if(business.industryProfile==="party_rental")return /party rentals?/i.test(offering)?`${offering} in ${city}`:`${offering} & Party Rentals in ${city}`;
 return business.rentalItems?.length?`Popular Rentals in ${city}`:`Popular Services in ${city}`;
}

export function LocationLanding({page,business,websiteUrl,ctaUrl,nearbyPages=[]}:{page:Page;business:Business;websiteUrl:string;ctaUrl:string;nearbyPages:Array<{slug:string;city:string;state:string|null}>}){
 const rentals=business.rentalItems?.slice(0,9)??[],offerings=rentals.length?rentals.map(item=>({...item,image_url:item.imageUrl})):business.services?.slice(0,9)??[];
 const ctaLabel=conversionLabel(business,ctaUrl),heading=locationHeading(business,page.city,page.state),offering=primaryOffering(business);
 const heroImage=business.photoUrls?.find(Boolean)||rentals.find(item=>item.imageUrl)?.imageUrl||null;
 const reviews=(business.googleReviews??[]).filter(review=>review.text&&review.rating>=1&&review.rating<=5).slice(0,3);
 const rating=business.googleRating??(reviews.length?reviews.reduce((sum,review)=>sum+review.rating,0)/reviews.length:null);
 const bookingEnabled=business.bookingEnabled??/\/(book|booking)(?:\/|$|\?)/.test(ctaUrl);
 const trustSignals=[rating?`${rating.toFixed(1)} customer rating${business.googleReviewCount?` from ${business.googleReviewCount} reviews`:""}`:null,`Serving ${page.city}`,bookingEnabled?"Online availability":business.requestEnabled!==false?"Easy quote requests":null,offerings.length?`${offerings.length} ${rentals.length?"rentals":"services"} to explore`:null].filter((value):value is string=>Boolean(value)).slice(0,4);
 const process=bookingEnabled
  ? business.industryProfile==="party_rental"
   ? [["1","Choose your rentals","Browse real inventory for your event."],["2","Check your date","See what is available for the day you need."],["3","Reserve online","Confirm your selection and booking details."]]
   : [["1","Choose a service","Select the help you need."],["2","Pick a time","Choose an available appointment."],["3","Confirm service","Review the details and schedule online."]]
  : [["1","Tell us what you need","Share a few details about your project."],["2","Get your quote","The local team will review your request."],["3","Schedule service","Choose the timing that works for you."]];
 return <main className={`promotion-landing location-landing ${styles.page}`} style={{"--promotion-brand":business.primaryColor??business.primary_color??"#1769f5"} as React.CSSProperties}>
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(page.schema_json).replace(/</g,"\\u003c")}}/>
  <header className="promotion-landing-header"><Link href={websiteUrl} className="promotion-brand" aria-label={`${business.name} main website`}>{business.logoUrl?<img src={business.logoUrl} alt={`${business.name} logo`}/>:<i>{business.name.slice(0,1)}</i>}<strong>{business.name}</strong></Link><div>{business.phone&&<a href={`tel:${business.phone}`}>{business.phone}</a>}<a className="promotion-header-cta" href={ctaUrl}>{ctaLabel}</a></div></header>
  <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href={websiteUrl}>Home</Link><span aria-hidden="true">/</span><span aria-current="page">{page.city} {offering}</span></nav>
  <section className={`promotion-hero location-hero ${styles.hero}${heroImage?` ${styles.heroWithImage}`:""}`}><div className={styles.heroCopy}><small>Serving {page.city}{page.state?`, ${page.state}`:""}</small><h1>{heading}</h1><p>{page.hero_copy}</p><a className="promotion-primary-cta" href={ctaUrl}>{ctaLabel}</a></div>{heroImage&&<div className={styles.heroMedia}><img src={heroImage} alt={`${business.name} serving ${page.city}`} fetchPriority="high"/></div>}</section>
  <section className={styles.trustRow} aria-label="Why customers choose this business">{trustSignals.map(signal=><span key={signal}><i aria-hidden="true">{"\u2713"}</i>{signal}</span>)}</section>
  {offerings.length>0&&<section className="promotion-rentals" id="services"><header><div><small>Explore your options</small><h2>{offeringsHeading(business,page.city)}</h2></div><b>{offerings.length} option{offerings.length===1?"":"s"}</b></header><div className="promotion-rental-grid">{offerings.map((item:any)=><article className="promotion-rental-card" key={item.id}><div className="promotion-rental-image">{item.image_url?<img src={item.image_url} alt={item.name} loading="lazy"/>:<span>{item.name.slice(0,1)}</span>}</div><div><h3>{item.name}</h3>{item.description&&<p className="category-rental-description">{item.description}</p>}<a href={ctaUrl}>{ctaLabel}</a></div></article>)}</div></section>}
  {(reviews.length>0||rating)&&<section className={styles.reviews}><header><small>Customer reviews</small><h2>Trusted by local customers</h2>{rating&&<p><strong>{rating.toFixed(1)} out of 5</strong>{business.googleReviewCount?` from ${business.googleReviewCount} reviews`:""}</p>}</header>{reviews.length>0&&<div>{reviews.map((review,index)=><blockquote key={`${review.author}-${index}`}><span aria-label={`${review.rating} out of 5 stars`}>{"\u2605".repeat(review.rating)}</span><p>&quot;{review.text}&quot;</p><cite>{review.author}</cite></blockquote>)}</div>}</section>}
  <section className={styles.process}><header><small>Simple next steps</small><h2>How it works</h2></header><div>{process.map(([number,title,copy])=><article key={number}><i>{number}</i><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
  <section className="location-page-content">{(page.sections??[]).map(section=><article key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></article>)}</section>
  <section className="location-page-faq"><header><small>Helpful answers</small><h2>Questions from {page.city} customers</h2></header><div>{(page.faqs??[]).map(faq=><details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</div></section>
  {nearbyPages.length>0&&<nav className="location-page-nearby" aria-label="Nearby service areas"><strong>Nearby areas we serve</strong>{nearbyPages.map(item=><Link href={`/${item.slug}`} key={item.slug}>{item.city}{item.state?`, ${item.state}`:""}</Link>)}</nav>}
  <section className="location-page-final-cta"><h2>Ready to get started in {page.city}?</h2><p>Connect directly with {business.name} and take the next step today.</p><a className="promotion-primary-cta" href={ctaUrl}>{ctaLabel}</a></section>
  <aside className={styles.mobileCta} aria-label="Quick action"><span><strong>{business.name}</strong><small>Serving {page.city}</small></span><a href={ctaUrl}>{ctaLabel}</a></aside>
 </main>;
}
