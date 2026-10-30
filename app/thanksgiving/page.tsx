import type {Metadata} from "next";
import Link from "next/link";
import {notFound} from "next/navigation";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {loadPublicBookingData} from "@/app/book/[businessSlug]/loadPublicBookingData";
import {thanksgivingRentalWindow} from "@/lib/thanksgivingRentalOffer";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Thanksgiving Inflatable Rentals | Copper State Bounce",description:"Keep the kids entertained all Thanksgiving weekend. Copper State Bounce delivers your inflatable Wednesday and picks it up Friday."};
function thanksgivingWindow(now=new Date()){const year=now.getMonth()>10||(now.getMonth()===10&&now.getDate()>26)?now.getFullYear()+1:now.getFullYear();return thanksgivingRentalWindow(year);}
const displayDate=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"});
const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(cents/100);

export default async function ThanksgivingPage(){
 if(!getSupabaseAdmin())notFound();
 const data=await loadPublicBookingData("copper-state-bounce");if(!data?.rentalInventory.length)notFound();
 const dates=thanksgivingWindow(),booking=`/book/copper-state-bounce?offer=thanksgiving&date=${dates.delivery}&endDate=${dates.pickup}`;
 const inflatables=data.rentalInventory.filter(item=>/bounce|slide|combo|obstacle|inflatable/i.test(`${item.name} ${item.category??""}`)).slice(0,6),featured=inflatables.length?inflatables:data.rentalInventory.slice(0,6);
 return <main className="thanksgiving-landing">
  <header className="thanksgiving-nav"><Link href="/sites/copper-state-bounce" className="thanksgiving-brand">Copper State Bounce</Link><Link href={booking} className="thanksgiving-nav-cta">Book Thanksgiving</Link></header>
  <section className="thanksgiving-hero"><div className="thanksgiving-hero-copy"><span className="thanksgiving-kicker">Thanksgiving week special</span><h1>Make Thanksgiving weekend the one the kids talk about.</h1><p>Your inflatable is delivered on Wednesday, so it&apos;s ready for Thanksgiving Day — and we pick it up Friday. More family fun, with one less thing on your plate.</p><div className="thanksgiving-actions"><Link href={booking}>Reserve for Thanksgiving</Link><a href="#rentals">Choose an inflatable</a></div><p className="thanksgiving-note">{displayDate(dates.delivery)} delivery · {displayDate(dates.pickup)} pickup · one-day price</p></div><div className="thanksgiving-hero-art" aria-hidden="true"><div className="thanksgiving-sun"/><span>🍂</span><span>🦃</span><span>🍁</span><div className="thanksgiving-bounce"><i/><i/><i/><b>Thanksgiving<br/>FUN</b></div></div></section>
  <section className="thanksgiving-timeline" aria-label="Thanksgiving rental schedule"><article><b>Wednesday</b><span>We deliver and set up your inflatable.</span></article><i>→</i><article><b>Thursday</b><span>Thanksgiving Day fun starts in the backyard.</span></article><i>→</i><article><b>Friday</b><span>We return for pickup after the holiday.</span></article></section>
  <section className="thanksgiving-intro"><span>Built for the long weekend</span><h2>Three days of happy kids. One-day rental price.</h2><p>Give cousins, neighbors, and little ones a place to play while the grown-ups catch up, cook, and enjoy the holiday.</p></section>
  <section className="thanksgiving-rentals" id="rentals"><header><div><span>Pick your favorite</span><h2>Thanksgiving-ready inflatables</h2></div><Link href={booking}>See all rentals →</Link></header><div className="thanksgiving-rental-grid">{featured.map(item=>{const itemUrl=`${booking}&item=${encodeURIComponent(item.id)}`;return <article key={item.id}>{item.image_url?<img src={item.image_url} alt={item.name}/>:<div className="thanksgiving-image-placeholder">🎈</div>}<div><span>{item.category||"Inflatable rental"}</span><h3>{item.name}</h3><p>{money(Number(item.starting_price_cents??item.daily_price_cents))} <small>for the Thanksgiving special</small></p><Link href={itemUrl}>Choose this inflatable</Link></div></article>})}</div></section>
  <section className="thanksgiving-final"><span>Ready when your family arrives</span><h2>Reserve your Thanksgiving inflatable today.</h2><p>Dates are selected for Wednesday delivery and Friday pickup. Qualifying inflatables are charged at the one-day price.</p><Link href={booking}>Reserve Thanksgiving Week</Link></section>
 </main>;
}
