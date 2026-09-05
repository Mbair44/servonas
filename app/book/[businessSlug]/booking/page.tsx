import { notFound } from "next/navigation";
import Link from "next/link";
import type {Metadata} from "next";
import PartyRentalBookingClient from "@/components/PartyRentalBookingClient";
import {EmbeddedBookingBridge} from "@/components/EmbeddedBookingBridge";
import {TenantBookingFunnelTracker} from "@/components/TenantBookingFunnelTracker";
import {publicGoogleMapsApiKey} from "@/lib/googleMapsKey";
import {loadPublicBookingData} from "../loadPublicBookingData";
import {TenantMetaPixel} from "@/components/TenantMetaPixel";

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
    const parsed=JSON.parse(value) as {date?:string;endDate?:string;startTime?:string;endTime?:string};
    return parsed;
  }catch{
    return undefined;
  }
}

export async function generateMetadata({params}:{params:Promise<{businessSlug:string}>}):Promise<Metadata>{
  const {businessSlug}=await params,data=await loadPublicBookingData(businessSlug);
  if(!data)return {};
  return {title:`Complete Reservation | ${data.businessName??"Business"}`,icons:data.bookingLogo?{icon:[{url:data.bookingLogo}],shortcut:data.bookingLogo,apple:data.bookingLogo}:undefined};
}

export default async function PublicBookingCheckoutPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<{embed?:string;promotion?:string;sv_at?:string;cartState?:string;dateState?:string}>}){
  const {businessSlug}=await params;
  const query=await searchParams;
  const embedded=query.embed==="1";
  const googleMapsApiKey=publicGoogleMapsApiKey();
  const initialCartState=parseCartState(query.cartState);
  const initialDateState=parseDateState(query.dateState);
  const data=await loadPublicBookingData(businessSlug);
  if(!data)notFound();
  const {settings,businessName,bookingLogo,metaPixelId,isPartyRental,rentalInventory,rentalCapacity,rentalUpsells,rentalOnlinePaymentsReady,rentalBlockedDates,schedule}=data;
  if(!isPartyRental)notFound();

  return (
    <>{metaPixelId&&<TenantMetaPixel pixelId={metaPixelId}/>} {embedded&&<EmbeddedBookingBridge/>}<TenantBookingFunnelTracker businessSlug={businessSlug} initialSessionId={query.sv_at}/><main
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

        {rentalInventory.length ? <PartyRentalBookingClient businessSlug={businessSlug} businessName={businessName ?? "this business"} inventory={rentalInventory} capacityByItem={rentalCapacity} blockedDates={rentalBlockedDates} relatedItems={rentalUpsells} schedule={schedule} standardDurationMinutes={Number(settings.rental_duration_minutes??240)} standardRentalHours={Number(settings.standard_rental_hours??24)} allowMultiDay={Boolean(settings.allow_multi_day_rentals)} additionalDayPricingType={settings.additional_day_pricing_type??"full_price"} additionalDayDiscountPercent={Number(settings.additional_day_discount_percent??0)} additionalDayFlatRateCents={settings.additional_day_flat_rate_cents==null?null:Number(settings.additional_day_flat_rate_cents)} maxRentalDays={settings.max_rental_days==null?null:Number(settings.max_rental_days)} depositPercent={Number(settings.rental_deposit_percent??25)} onlinePaymentsReady={rentalOnlinePaymentsReady} googleMapsApiKey={googleMapsApiKey} initialPromotionCode={query.promotion} attributionSessionId={query.sv_at} initialCheckout catalogUrl={`/book/${businessSlug}`} initialCartState={initialCartState} initialDateState={initialDateState} /> : <div className="booking-empty">No rental items are available for online booking yet.</div>}
      </section>
      {!embedded&&<footer><Link href={`/book/${businessSlug}/privacy`}>Privacy Policy</Link> · <Link href={`/book/${businessSlug}/terms`}>Text Messaging Terms</Link></footer>}
    </main></>
  );
}
