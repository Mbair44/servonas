import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {MechanicalBullLanding} from "@/components/MechanicalBullLanding";
import {loadMechanicalBullLandingData} from "@/lib/mechanicalBullLanding";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Mechanical Bull Rental Gilbert AZ | Copper State Bounce",description:"Rent a mechanical bull for parties, schools, churches, corporate events and more. Check availability and book online with Copper State Bounce.",keywords:["mechanical bull rental","mechanical bull rental Gilbert","mechanical bull rental Mesa","mechanical bull rental Chandler","mechanical bull rental Phoenix","rodeo bull rental"]};
type Query=Record<string,string|string[]|undefined>;
const trackedKeys=new Set(["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid"]);
const bookingUrl=(slug:string,itemId:string,query:Query)=>{const params=new URLSearchParams({embed:"1",item:itemId});for(const [key,value] of Object.entries(query))if(trackedKeys.has(key)&&typeof value==="string")params.set(key,value);return `/book/${encodeURIComponent(slug)}?${params}`;};
export default async function MechanicalBullRentalPage({searchParams}:{searchParams:Promise<Query>}){
 const db=getSupabaseAdmin();if(!db)notFound();
 const data=await loadMechanicalBullLandingData(db);if(!data)notFound();
 return <MechanicalBullLanding data={data} bookingUrl={bookingUrl(data.bookingSlug,data.item.id,await searchParams)}/>;
}
