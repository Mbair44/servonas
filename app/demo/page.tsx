import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata={
 title:"Servonas Demo — See a Live Party Rental Workflow",
 description:"See a live Servonas-powered party-rental workflow with online catalog, availability, deposits, checkout, booking receipts, and admin tools.",
};

export default function Demo(){return <main><section className="sv-page-hero"><div className="sv-container"><span className="sv-kicker">Live product proof</span><h1>See the customer experience already running a real rental workflow.</h1><p>NRS Party Rentals is the first business built on the Servonas foundation.</p><div className="sv-actions"><a className="sv-button" href="https://nrspartyrentals.com" target="_blank" rel="noreferrer">Open NRS Live Site</a><Link className="sv-button sv-secondary" href="/early-access">Join Early Access</Link></div></div></section><section className="sv-section"><div className="sv-container sv-demo-frame"><div className="sv-demo-top"><span/><span/><span/><b>nrspartyrentals.com</b></div><div className="sv-demo-content"><img src="/nrs-logo.png" alt="NRS Party Rentals"/><h2>First Servonas proof business</h2><p>Explore a customer-facing catalog, rental inventory images, availability, deposits, checkout, booking receipts, coupons, refunds, and operational tools. Messaging availability depends on each business&apos;s configuration.</p><a href="https://nrspartyrentals.com" target="_blank" rel="noreferrer">Visit live business →</a></div></div></section></main>}
