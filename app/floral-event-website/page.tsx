import type {Metadata} from "next";
import {WebsiteIndustryLanding,type WebsiteIndustryLandingConfig} from "@/components/WebsiteIndustryLanding";

export const metadata:Metadata={title:"Free Floral & Event Website | Servonas",description:"We'll build your floral or event-design website and cover one standard domain for the first year. Add inquiries, consultations, customers, estimates, invoices, and payments.",keywords:["florist website design","floral business website","event florist website","wedding florist website builder"],alternates:{canonical:"/floral-event-website"}};

const config:WebsiteIndustryLandingConfig={source:"floral-event-website",name:"Floral & Event",plural:"floral and event companies",eyebrow:"Websites for floral and event professionals",headline:"Beautiful flowers. Memorable moments.",description:"Get a professional floral and event website, your first-year standard domain, consultation requests, customer management, estimates, invoices, payments, and more.",image:"/images/floral-event-designer-at-work.png",imageAlt:"Floral designer arranging flowers for an elegant event",demoPath:"/demo/floral-event",services:["Wedding Florals","Event Florals","Custom Installations"],audiences:["Wedding florists","Event floral designers","Floral studios","Event styling companies"],accentClass:"floral-event-website-landing"};

export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <WebsiteIndustryLanding config={config} params={await searchParams}/>;}
