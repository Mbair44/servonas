import {notFound} from "next/navigation";
import Link from "next/link";
import type {Metadata} from "next";
import PartyRentalBookingClient from "@/components/PartyRentalBookingClient";
import {EmbeddedBookingBridge} from "@/components/EmbeddedBookingBridge";
import {TenantBookingFunnelTracker} from "@/components/TenantBookingFunnelTracker";
import {loadPublishedBusinessWebsiteByDomain} from "@/lib/businessWebsite";
import {normalizeWebsiteDomain} from "@/lib/website";
import {loadPublicBookingData} from "@/app/book/[businessSlug]/loadPublicBookingData";

function parseCartState(value:string|undefined){
 if(!value)return undefined;
 try{
  const parsed=JSON.parse(value) as Record<string,unknown>;
  const next=Object.fromEntries(Object.entries(parsed).filter(([,quantity])=>Number.isFinite(Number(quantity))&&Number(quantity)>0).map(([itemId,quantity])=>[itemId,Math.max(0,Math.floor(Number(quantity)))]));
  return Object.keys(next).length?next:undefined;
 }catch{
  return undefined;
 }
}

function parseDateState(value:string|undefined){
 if(!value)return undefined;
 try{
  return JSON.parse(value) as {date?:string;endDate?:string;startTime?:string;endTime?:string};
 }catch{
  return undefined;
 }
}

export async function generateMetadata({params}:{params:Promise<{domain:string}>}):Promise<Metadata>{
 const raw=decodeURIComponent((await params).domain),domain=normalizeWebsiteDomain(raw);
 if(!domain)return {};
 const record=await loadPublishedBusinessWebsiteByDomain(domain);
 if(!record?.site)return {};
 return {title:`Complete Reservation | ${record.site.name}`,description:record.site.heroSubheading,icons:record.site.logoUrl?{icon:[{url:record.site.logoUrl}],shortcut:record.site.logoUrl,apple:record.site.logoUrl}:undefined};
}

export default async function CustomDomainBookingCheckoutPage({params,searchParams}:{params:Promise<{domain:string}>;searchParams:Promise<{embed?:string;sv_at?:string;cartState?:string;dateState?:string}>}){
 const raw=decodeURIComponent((await params).domain),domain=normalizeWebsiteDomain(raw);
 if(!domain)notFound();
 const record=await loadPublishedBusinessWebsiteByDomain(domain);
 if(!record?.site.bookingSlug)notFound();
 const query=await searchParams;
 const embedded=query.embed==="1";
 const initialCartState=parseCartState(query.cartState);
 const initialDateState=parseDateState(query.dateState);
 const data=await loadPublicBookingData(record.site.bookingSlug);
 if(!data)notFound();
 const {settings,businessName,bookingLogo,isPartyRental,rentalInventory,rentalCapacity,rentalUpsells,rentalOnlinePaymentsReady,rentalBlockedDates,schedule}=data;
 if(!isPartyRental)notFound();

 return (
  <>{embedded&&<EmbeddedBookingBridge/>}<TenantBookingFunnelTracker businessSlug={record.site.bookingSlug} initialSessionId={query.sv_at}/><main className={`public-booking public-booking-checkout${embedded?" embedded-booking":""}`} style={{"--booking-brand":settings.brand_color} as React.CSSProperties}>
   <section className="public-booking-card">
    {!embedded&&<header>
     {bookingLogo?<img src={bookingLogo} alt={`${businessName??"Business"} logo`}/>:<div className="booking-mark">{businessName?.slice(0,1)}</div>}
     <small>Reservation checkout</small>
     <h1>{businessName}</h1>
     <p>Review your party cart, confirm your event details, and finish booking.</p>
    </header>}

    {rentalInventory.length?<PartyRentalBookingClient businessSlug={record.site.bookingSlug} businessName={businessName??"this business"} inventory={rentalInventory} capacityByItem={rentalCapacity} blockedDates={rentalBlockedDates} relatedItems={rentalUpsells} schedule={schedule} standardDurationMinutes={Number(settings.rental_duration_minutes??240)} standardRentalHours={Number(settings.standard_rental_hours??24)} allowMultiDay={Boolean(settings.allow_multi_day_rentals)} additionalDayPricingType={settings.additional_day_pricing_type??"full_price"} additionalDayDiscountPercent={Number(settings.additional_day_discount_percent??0)} additionalDayFlatRateCents={settings.additional_day_flat_rate_cents==null?null:Number(settings.additional_day_flat_rate_cents)} maxRentalDays={settings.max_rental_days==null?null:Number(settings.max_rental_days)} depositPercent={Number(settings.rental_deposit_percent??25)} onlinePaymentsReady={rentalOnlinePaymentsReady} googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY?process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:undefined} attributionSessionId={query.sv_at} initialCheckout catalogUrl="/booking" initialCartState={initialCartState} initialDateState={initialDateState}/>:<div className="booking-empty">No rental items are available for online booking yet.</div>}
   </section>
   <footer>{embedded?<>Powered by <b>Servonas</b></>:<>Powered by <b>Servonas</b> · <Link href={`/book/${record.site.bookingSlug}/privacy`}>Privacy Policy</Link> · <Link href={`/book/${record.site.bookingSlug}/terms`}>Text Messaging Terms</Link></>}</footer>
  </main></>
 );
}
