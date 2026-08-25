import type {Metadata} from "next";
import Link from "next/link";
import {BusinessWebsite,type BusinessSiteData} from "@/components/BusinessWebsite";

export const metadata:Metadata={title:"Event & Party Rental Website Example | Servonas",description:"Example event and party rental website built with Servonas.",robots:{index:false,follow:true}};

const attributionKeys=["utm_source","utm_medium","utm_campaign","utm_content","utm_term","gclid","gbraid","wbraid"] as const;

export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const params=await searchParams;
 const query=new URLSearchParams({source:"event-party-rentals-website",utm_content:"event_party_rentals_demo"});
 for(const key of attributionKeys){
  const raw=params[key],value=Array.isArray(raw)?raw[0]:raw;
  if(value)query.set(key,value.slice(0,500));
 }
 const site:BusinessSiteData={
  bookingSlug:null,
  name:"BrightSky Event Rentals",
  phone:"(555) 010-0148",
  email:"hello@example.invalid",
  logoUrl:null,
  industryProfile:"party_rental",
  websiteSource:"event-party-rentals-website",
  template:"modern",
  primaryColor:"#e46a2c",
  secondaryColor:"#1f2a44",
  floralFontStyle:"modern",
  floralAccentColor:"#e46a2c",
  floralBackgroundColor:"#fffaf7",
  floralPhotoLayout:"hero_right",
  heroHeading:"Bring the Party Together Without the Guesswork",
  heroSubheading:"Browse rental inventory, check event-date availability, and plan delivery with a local rental team that keeps every detail organized.",
  aboutText:"BrightSky Event Rentals is a fictional party-rental company created to demonstrate the kind of polished rental website Servonas can build for bounce houses, tents, tables, chairs, games, and event extras.",
  instagramUrl:null,
  googleReviewUrl:null,
  googleRating:null,
  googleReviewCount:null,
  googleReviews:[],
  photoUrls:[
   "/images/event-party-rentals-bounce-house-setup.png",
   "/images/event-party-rentals-team-setting-up-tent.png",
   "/images/event-party-rentals-upscale-tent-setup.png",
  ],
  requestEnabled:false,
  bookingEnabled:false,
  bookingUrl:null,
  services:[],
  rentalItems:[
   {id:"1",name:"Palm Breeze Bounce House",category:"Inflatables",description:"A colorful all-ages bounce house for birthdays, school events, and neighborhood parties.",dailyPriceCents:24900,imageUrl:null,standardRentalHours:24,multiDayMessage:"Discounted extra-day pricing available.",lengthFt:15,widthFt:15,heightFt:14},
   {id:"2",name:"40 White Folding Chairs",category:"Tables and Chairs",description:"Clean, event-ready seating for ceremonies, backyard celebrations, and school gatherings.",dailyPriceCents:6800,imageUrl:null,standardRentalHours:24,multiDayMessage:null,lengthFt:null,widthFt:null,heightFt:null},
   {id:"3",name:"8-Foot Banquet Tables",category:"Tables and Chairs",description:"Commercial banquet tables ideal for food service, gifts, crafts, and event seating layouts.",dailyPriceCents:1400,imageUrl:null,standardRentalHours:24,multiDayMessage:null,lengthFt:8,widthFt:2.5,heightFt:2.5},
   {id:"4",name:"20x20 High-Peak Tent",category:"Tents and Canopies",description:"A premium canopy setup for weddings, corporate events, shade coverage, and outdoor parties.",dailyPriceCents:39500,imageUrl:null,standardRentalHours:24,multiDayMessage:"Ask about multi-day event packages.",lengthFt:20,widthFt:20,heightFt:18},
   {id:"5",name:"Yard Party Game Set",category:"Games and Add-ons",description:"Add oversized party games for family events, company picnics, and school celebrations.",dailyPriceCents:5900,imageUrl:null,standardRentalHours:24,multiDayMessage:null,lengthFt:null,widthFt:null,heightFt:null},
   {id:"6",name:"LED Cocktail Tables",category:"Wedding and Event Decor",description:"Modern illuminated cocktail tables that add style to evening receptions and private events.",dailyPriceCents:3200,imageUrl:null,standardRentalHours:24,multiDayMessage:null,lengthFt:null,widthFt:null,heightFt:3.5},
  ],
  hours:[4,5,6,0].map(weekday=>({weekday,start:"08:00",end:"18:00"})),
  serviceAreas:["Phoenix","Scottsdale","Tempe","Mesa","Chandler","Gilbert"],
  announcementText:"Demo website only. Availability and checkout are disabled in this example.",
 };
 return <>
  <aside className="industry-example-banner"><span>This is a fictional example website built with Servonas.</span><Link href={`/signup?${query}`}>Build My Rental Website — Free</Link></aside>
  <BusinessWebsite site={site}/>
 </>;
}
