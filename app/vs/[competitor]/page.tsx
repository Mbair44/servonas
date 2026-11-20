import Link from "next/link";
import {notFound} from "next/navigation";
import type { Metadata } from "next";

const comparisons={
 "jobber":{name:"Jobber",title:"Servonas vs. Jobber for owner-led crews",description:"Compare Servonas and Jobber for field operations and who each product fits.",price:"Servonas is opening early access while plans and pricing are finalized. Check Jobber's current pricing directly before deciding.",fit:"Jobber is a mature choice for teams that want its established ecosystem. Servonas is for owner-led crews that want to help shape one connected system while joining early access."},
 "housecall-pro":{name:"Housecall Pro",title:"Servonas vs. Housecall Pro for owner-led crews",description:"Compare Servonas and Housecall Pro for scheduling, dispatch, booking, invoicing, and payments.",price:"Servonas is opening early access while plans and pricing are finalized. Check Housecall Pro's current pricing and included features directly before deciding.",fit:"Housecall Pro is an established field-service platform. Servonas is a fit for crews that want early access to one system for office and field work."},
 "spreadsheets":{name:"spreadsheets",title:"Servonas vs. spreadsheets: move service work out of manual tracking",description:"See how Servonas connects customer records, work orders, dispatch, booking, invoices, and payments.",price:"Servonas is opening early access while plans and pricing are finalized.",fit:"Spreadsheets can work for a very small, stable list. Servonas fits teams ready to coordinate customers, work orders, routes, and payments in one shared workspace."}
} as const;
type Competitor=keyof typeof comparisons;

export function generateStaticParams(){return Object.keys(comparisons).map(competitor=>({competitor}));}
export async function generateMetadata({params}:{params:Promise<{competitor:string}>}):Promise<Metadata>{const {competitor}=await params;const item=comparisons[competitor as Competitor];return item?{title:item.title,description:item.description}:{};}
export default async function ComparisonPage({params}:{params:Promise<{competitor:string}>}){
 const {competitor}=await params; const item=comparisons[competitor as Competitor]; if(!item)notFound();
 return <main><section className="sv-page-hero"><div className="sv-container"><span className="sv-kicker">Compare field-service software</span><h1>Servonas vs. {item.name}</h1><p>{item.description}</p></div></section><section className="sv-section"><div className="sv-container comparison-content"><h2>What changes for a small service crew</h2><div className="comparison-table"><div><strong>Servonas</strong><span>One connected workspace for customers, work orders, route-aware dispatch, online booking, invoices, and payments.</span></div><div><strong>{item.name}</strong><span>{item.fit.split(". ")[0]}.</span></div><div><strong>Pricing approach</strong><span>{item.price}</span></div><div><strong>Who it fits</strong><span>{item.fit}</span></div></div><p className="comparison-note">Prices and competitor offerings can change. Check the competitor&apos;s current pricing before deciding.</p></div></section><section className="sv-cta"><div className="sv-container"><h2>Join Servonas while early access is available.</h2><Link className="sv-button sv-light" href="/contact?interest=early-access">Join Early Access</Link></div></section></main>;
}
