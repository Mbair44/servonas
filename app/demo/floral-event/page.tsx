import type {Metadata} from "next";
import {WebsiteIndustryDemo} from "@/components/WebsiteIndustryDemo";

export const metadata:Metadata={title:"Floral & Event Website Example | Servonas",robots:{index:false,follow:true}};

export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <WebsiteIndustryDemo params={await searchParams} config={{source:"floral-event-website",name:"Floral & Event",businessName:"Willow & Bloom Floral Studio",industryProfile:"other",services:["Wedding Florals","Event Florals","Bridal Bouquets","Centerpieces","Ceremony Installations","Delivery and Setup"],hero:"Beautiful Flowers for Life’s Most Meaningful Moments",subheading:"Thoughtful floral design for weddings, celebrations, corporate events, and gatherings of every size.",about:"Willow & Bloom Floral Studio is a fictional floral and event-design company demonstrating a Servonas-powered website.",primary:"#a64d79",secondary:"#3f2936",areas:["Denver","Lakewood","Littleton","Golden"],photos:["/images/floral-event-designer-at-work.png"]}}/>;}
