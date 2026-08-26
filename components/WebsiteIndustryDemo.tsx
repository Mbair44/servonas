import Link from "next/link";
import {BusinessWebsite,type BusinessSiteData} from "./BusinessWebsite";
import type {WebsiteFirstSource} from "@/lib/websiteFirstConfig";

const attributionKeys=["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","gbraid","wbraid"] as const;
type DemoConfig={source:WebsiteFirstSource;name:string;businessName:string;industryProfile:string;services:string[];hero:string;subheading:string;about:string;primary:string;secondary:string;areas:string[];photos?:string[]};
export function WebsiteIndustryDemo({config,params}:{config:DemoConfig;params:Record<string,string|string[]|undefined>}){
 const query=new URLSearchParams({source:config.source,utm_content:`${config.source.replace("-website","")}_demo`});for(const key of attributionKeys){const raw=params[key],value=Array.isArray(raw)?raw[0]:raw;if(value)query.set(key,value.slice(0,500));}
 const site:BusinessSiteData={name:config.businessName,phone:"(555) 010-0148",email:"hello@example.invalid",logoUrl:null,industryProfile:config.industryProfile,websiteSource:config.source,template:"modern",primaryColor:config.primary,secondaryColor:config.secondary,floralFontStyle:"elegant",floralAccentColor:"#b85c7c",floralBackgroundColor:"#fffafc",floralPhotoLayout:"hero_right",heroHeading:config.hero,heroSubheading:config.subheading,aboutText:config.about,instagramUrl:null,googleReviewUrl:null,googleRating:null,googleReviewCount:null,googleReviews:[],photoUrls:config.photos??[],photoMotionStyle:"static",requestEnabled:false,bookingEnabled:false,bookingUrl:null,services:config.services.map((name,index)=>({id:String(index+1),name,description:`Professional ${name.toLowerCase()} from a dependable local team.`,price_amount:null,price_label:"quote"})),rentalItems:[],hours:[1,2,3,4,5].map(weekday=>({weekday,start:"08:00",end:"17:00"})),serviceAreas:config.areas,announcementText:null};
 return <><aside className="industry-example-banner"><span>This is a fictional example website built with Servonas.</span><Link href={`/onboarding?${query}`}>Build My Website — Free</Link></aside><BusinessWebsite site={site}/></>;
}
