import type {Metadata} from "next";
import {WebsiteIndustryLanding,type WebsiteIndustryLandingConfig} from "@/components/WebsiteIndustryLanding";

export const metadata:Metadata={title:"Free Event & Party Rental Website | Servonas",description:"We'll build your event and party rental website and cover one standard domain for the first year. Add rental inventory, online availability, customer bookings, deposits, invoices, and payments.",keywords:["party rental website","event rental website builder","bounce house website","wedding rental website","tent rental website"],alternates:{canonical:"/event-party-rentals-website"}};

const config:WebsiteIndustryLandingConfig={source:"event-party-rentals-website",name:"Event & Party Rentals",plural:"event and party rental companies",eyebrow:"Websites for event and party rental companies",headline:"Inventory, availability, and bookings in one place.",description:"Get a professional rental website, your first-year standard domain, online inventory browsing, date availability, customer bookings, deposits, invoices, payments, and more.",demoPath:"/demo/event-party-rentals",services:["Bounce Houses","Tables and Chairs","Tents and Canopies"],audiences:["Party-rental owner-operators","Event-rental companies","Wedding and tent rental businesses","Growing delivery teams"],accentClass:"event-party-rentals-website-landing"};

export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <WebsiteIndustryLanding config={config} params={await searchParams}/>;}
