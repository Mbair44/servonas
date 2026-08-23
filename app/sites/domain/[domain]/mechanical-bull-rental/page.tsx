import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {MechanicalBullLanding} from "@/components/MechanicalBullLanding";
import {TemporarySiteUnavailable} from "@/components/TemporarySiteUnavailable";
import {loadPublishedBusinessWebsiteByDomain} from "@/lib/businessWebsite";
import {loadMechanicalBullLandingData} from "@/lib/mechanicalBullLanding";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {normalizeWebsiteDomain} from "@/lib/website";

export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Mechanical Bull Rental Gilbert AZ | Copper State Bounce",description:"Rent a mechanical bull for parties, schools, churches, corporate events and more. Check availability and book online with Copper State Bounce."};
export default async function CustomDomainMechanicalBullPage({params,searchParams}:{params:Promise<{domain:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const domain=normalizeWebsiteDomain(decodeURIComponent((await params).domain)),db=getSupabaseAdmin();if(!domain||!db)notFound();
 const record=await loadPublishedBusinessWebsiteByDomain(domain,"/sites/domain/[domain]/mechanical-bull-rental");
 if(record.kind==="not_found")notFound();
 if(record.kind==="unavailable")return <TemporarySiteUnavailable domain={domain} title="This website is temporarily unavailable." message="Please try again in a few minutes."/>;
 const data=await loadMechanicalBullLandingData(db,record.settings.business_id);if(!data)notFound();
 const paramsForBooking=new URLSearchParams({embed:"1",item:data.item.id});for(const [key,value] of Object.entries(await searchParams))if(["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid"].includes(key)&&typeof value==="string")paramsForBooking.set(key,value);
 return <MechanicalBullLanding data={data} bookingUrl={`/book/${encodeURIComponent(data.bookingSlug)}?${paramsForBooking}`}/>;
}
