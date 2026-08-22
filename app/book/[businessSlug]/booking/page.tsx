import { notFound } from "next/navigation";
import Link from "next/link";
import type {Metadata} from "next";
import PartyRentalBookingClient from "@/components/PartyRentalBookingClient";
import {EmbeddedBookingBridge} from "@/components/EmbeddedBookingBridge";
import {TenantBookingFunnelTracker} from "@/components/TenantBookingFunnelTracker";
import {loadPublicBookingData} from "../loadPublicBookingData";

export async function generateMetadata({params}:{params:Promise<{businessSlug:string}>}):Promise<Metadata>{
  const {businessSlug}=await params,data=await loadPublicBookingData(businessSlug);
  if(!data)return {};
  return {title:`Complete Reservation | ${data.businessName??"Business"}`,icons:data.bookingLogo?{icon:[{url:data.bookingLogo}],shortcut:data.bookingLogo,apple:data.bookingLogo}:undefined};
}

export default async function PublicBookingCheckoutPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<{embed?:string;sv_at?:string}>}){
  const {businessSlug}=await params;
  const query=await searchParams;
  const embedded=query.embed==="1";
  const data=await loadPublicBookingData(businessSlug);
  if(!data)notFound();
  const {settings,businessName,bookingLogo,isPartyRental,rentalInventory,rentalCapacity,rentalUpsells,rentalOnlinePaymentsReady,rentalBlockedDates,schedule}=data;
  if(!isPartyRental)notFound();

  return (
    <>{embedded&&<EmbeddedBookingBridge/>}<TenantBookingFunnelTracker businessSlug={businessSlug} initialSessionId={query.sv_at}/><main
      className={`public-booking public-booking-checkout${embedded ? " embedded-booking" : ""}`}
      style={{ "--booking-brand": settings.brand_color } as React.CSSProperties}
    >
      <section className="public-booking-card">
        {!embedded && <header>
          {bookingLogo ? (
            <img src={bookingLogo} alt={`${businessName ?? "Business"} logo`} />
          ) : (
            <div className="booking-mark">{businessName?.slice(0, 1)}</div>
          )}
          <small>Reservation checkout</small>
          <h1>{businessName}</h1>
          <p>Review your party cart, confirm your event details, and finish booking.</p>
        </header>}

        {rentalInventory.length ? <PartyRentalBookingClient businessSlug={businessSlug} businessName={businessName ?? "this business"} inventory={rentalInventory} capacityByItem={rentalCapacity} blockedDates={rentalBlockedDates} relatedItems={rentalUpsells} schedule={schedule} standardDurationMinutes={Number(settings.rental_duration_minutes??240)} standardRentalHours={Number(settings.standard_rental_hours??24)} allowMultiDay={Boolean(settings.allow_multi_day_rentals)} additionalDayPricingType={settings.additional_day_pricing_type??"full_price"} additionalDayDiscountPercent={Number(settings.additional_day_discount_percent??0)} additionalDayFlatRateCents={settings.additional_day_flat_rate_cents==null?null:Number(settings.additional_day_flat_rate_cents)} maxRentalDays={settings.max_rental_days==null?null:Number(settings.max_rental_days)} depositPercent={Number(settings.rental_deposit_percent??25)} onlinePaymentsReady={rentalOnlinePaymentsReady} googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY?process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:undefined} attributionSessionId={query.sv_at} initialCheckout catalogUrl={`/book/${businessSlug}`} /> : <div className="booking-empty">No rental items are available for online booking yet.</div>}
      </section>
      <footer>{embedded ? <>Powered by <b>Servonas</b></> : <>Powered by <b>Servonas</b> · <Link href={`/book/${businessSlug}/privacy`}>Privacy Policy</Link> · <Link href={`/book/${businessSlug}/terms`}>Text Messaging Terms</Link></>}</footer>
    </main></>
  );
}
