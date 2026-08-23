import {notFound} from "next/navigation";
import Link from "next/link";
import type {Metadata} from "next";
import PublicBookingForm from "@/components/PublicBookingForm";
import PartyRentalBookingClient from "@/components/PartyRentalBookingClient";
import {EmbeddedBookingBridge} from "@/components/EmbeddedBookingBridge";
import {TenantBookingFunnelTracker} from "@/components/TenantBookingFunnelTracker";
import {TemporarySiteUnavailable} from "@/components/TemporarySiteUnavailable";
import {loadPublishedBusinessWebsiteByDomain} from "@/lib/businessWebsite";
import {normalizeWebsiteDomain} from "@/lib/website";
import {submitPublicBooking} from "@/app/book/[businessSlug]/actions";
import {loadPublicBookingData} from "@/app/book/[businessSlug]/loadPublicBookingData";

export const dynamic="force-dynamic";

export async function generateMetadata({params}:{params:Promise<{domain:string}>}):Promise<Metadata>{
 const raw=decodeURIComponent((await params).domain),domain=normalizeWebsiteDomain(raw);
 if(!domain)return {};
 const record=await loadPublishedBusinessWebsiteByDomain(domain,"/sites/domain/[domain]/booking");
 if(record.kind!=="ok")return {};
 return {title:`Book Online | ${record.site.name}`,description:record.site.heroSubheading,icons:record.site.logoUrl?{icon:[{url:record.site.logoUrl}],shortcut:record.site.logoUrl,apple:record.site.logoUrl}:undefined};
}

export default async function CustomDomainBookingPage({params,searchParams}:{params:Promise<{domain:string}>;searchParams:Promise<{error?:string;embed?:string;item?:string;sv_at?:string;checkout?:string;checkoutUrl?:string}>}){
 const raw=decodeURIComponent((await params).domain),domain=normalizeWebsiteDomain(raw);
 if(!domain)notFound();
 const record=await loadPublishedBusinessWebsiteByDomain(domain,"/sites/domain/[domain]/booking");
 if(record.kind==="not_found"||record.kind==="ok"&&!record.site.bookingSlug)notFound();
 if(record.kind==="unavailable")return <TemporarySiteUnavailable domain={domain} title="Online booking is temporarily unavailable." message="Please try again in a few minutes."/>;
 const bookingSlug=record.kind==="ok"?record.site.bookingSlug:null;
 if(!bookingSlug)notFound();
 const query=await searchParams;
 const embedded=query.embed==="1";
 const data=await loadPublicBookingData(bookingSlug);
 if(!data)notFound();
 const {settings,services,schedule,businessName,bookingLogo,isPartyRental,rentalInventory,rentalCapacity,rentalUpsells,rentalOnlinePaymentsReady,rentalBlockedDates}=data;

 return (
  <>{embedded&&<EmbeddedBookingBridge/>}<TenantBookingFunnelTracker businessSlug={bookingSlug} initialSessionId={query.sv_at}/><main className={`public-booking${embedded?" embedded-booking":""}`} style={{"--booking-brand":settings.brand_color} as React.CSSProperties}>
   <section className="public-booking-card">
    {!embedded&&<header>
     {bookingLogo?<img src={bookingLogo} alt={`${businessName??"Business"} logo`}/>:<div className="booking-mark">{businessName?.slice(0,1)}</div>}
     <small>Online booking</small>
     <h1>{businessName}</h1>
     <p>{settings.welcome_message}</p>
    </header>}

    {query.error&&<div className="workspace-notice error">{query.error}</div>}
    {isPartyRental?(
     rentalInventory.length?<PartyRentalBookingClient businessSlug={bookingSlug} businessName={businessName??"this business"} inventory={rentalInventory} capacityByItem={rentalCapacity} blockedDates={rentalBlockedDates} relatedItems={rentalUpsells} schedule={schedule} standardDurationMinutes={Number(settings.rental_duration_minutes??240)} standardRentalHours={Number(settings.standard_rental_hours??24)} allowMultiDay={Boolean(settings.allow_multi_day_rentals)} additionalDayPricingType={settings.additional_day_pricing_type??"full_price"} additionalDayDiscountPercent={Number(settings.additional_day_discount_percent??0)} additionalDayFlatRateCents={settings.additional_day_flat_rate_cents==null?null:Number(settings.additional_day_flat_rate_cents)} maxRentalDays={settings.max_rental_days==null?null:Number(settings.max_rental_days)} depositPercent={Number(settings.rental_deposit_percent??25)} onlinePaymentsReady={rentalOnlinePaymentsReady} googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY?process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:undefined} initialItemId={query.item&&rentalInventory.some(item=>item.id===query.item)?query.item:undefined} attributionSessionId={query.sv_at} initialCheckout={query.checkout==="1"} checkoutUrl={query.checkoutUrl??"/booking/checkout"} catalogUrl="/booking"/>:<div className="booking-empty">No rental items are available for online booking yet.</div>
    ):!services?.length?(
     <div className="booking-empty">No services are available for online booking yet.</div>
    ):(
     <PublicBookingForm action={submitPublicBooking.bind(null,bookingSlug)} services={services} schedule={schedule} collectAddress={Boolean(settings.collect_address)} intakeQuestions={settings.intake_questions??[]} businessName={businessName??"this business"} maximumDaysAhead={Number(settings.maximum_days_ahead??60)} googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} publicSlug={bookingSlug} timezone={settings.timezone??"America/Phoenix"}/>
    )}
   </section>
   <footer>{embedded?<>Powered by <b>Servonas</b></>:<>Powered by <b>Servonas</b> · <Link href={`/book/${bookingSlug}/privacy`}>Privacy Policy</Link> · <Link href={`/book/${bookingSlug}/terms`}>Text Messaging Terms</Link></>}</footer>
  </main></>
 );
}
