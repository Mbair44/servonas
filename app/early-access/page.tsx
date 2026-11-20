import type { Metadata } from "next";
import { EarlyAccessForm } from "./EarlyAccessForm";

export const metadata: Metadata = {title:"Servonas Early Access",description:"Join the early-access list for party rental software from Servonas.",alternates:{canonical:"/early-access"},robots:{index:false,follow:true}};

export default function EarlyAccessPage(){return <main><section className="sv-page-hero contact-hero"><div className="sv-container contact-layout"><div className="contact-intro"><span className="sv-kicker">Party rental software</span><h1>Get Early Access to Servonas</h1><p>Be among the first party rental businesses to explore software built for bookings, inventory, payments, deliveries, and customer communication.</p><p>Joining the list expresses interest and does not guarantee immediate access.</p></div><div className="contact-card"><EarlyAccessForm/></div></div></section></main>;}
