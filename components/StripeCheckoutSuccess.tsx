import Link from "next/link";
import {notFound} from "next/navigation";
import Stripe from "stripe";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {TenantGoogleAdsTag} from "@/components/TenantGoogleAdsTag";
import {normalizeGoogleAdsTagId} from "@/lib/googleTag";
import {TenantMetaPixel} from "@/components/TenantMetaPixel";
import {TenantMetaPixelPurchaseTracker} from "@/components/TenantMetaPixelPurchaseTracker";
import {GoogleAdsBookingConversion} from "@/components/GoogleAdsBookingConversion";
import {normalizeGoogleAdsConversionDestination} from "@/lib/googleAds";

function money(cents:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);}

export async function StripeCheckoutSuccess({sessionId,expectedBusinessId,includeTenantGoogleTag=true,calendarHref="/book"}:{sessionId?:string;expectedBusinessId?:string;includeTenantGoogleTag?:boolean;calendarHref?:string}){
 const stripeKey=process.env.STRIPE_SECRET_KEY;
 let session:Stripe.Checkout.Session|null=null,businessName="the business",homeHref="/",bookingId:string|null=null,metaPixelId:string|null=null,googleAdsTagId:string|null=null,googleAdsBookingConversionDestination:string|null=null,googleAdsBusinessId:string|null=null,bookingTotalCents:number|null=null,isInitialOnlineRentalCheckout=false,bookingConfirmed=false;
 if(sessionId&&stripeKey){
  try{
   const stripe=new Stripe(stripeKey),db=getSupabaseAdmin();
   const {data:booking}=db?await db.from("bookings").select("id,business_id,status,total_cents,businesses(name)").eq("stripe_checkout_session_id",sessionId).maybeSingle():{data:null};
   if(expectedBusinessId&&booking?.business_id!==expectedBusinessId)notFound();
   bookingId=booking?.id??null;
   bookingTotalCents=Number.isSafeInteger(Number(booking?.total_cents))&&Number(booking?.total_cents)>=0?Number(booking?.total_cents):null;
   const business=booking?(Array.isArray(booking.businesses)?booking.businesses[0]:booking.businesses):null;
   businessName=business?.name||businessName;
   const {data:website}=db&&booking?.business_id?await db.from("business_website_settings").select("public_slug,status,custom_domain,domain_status,meta_pixel_id,google_ads_tag_id,google_ads_booking_conversion_destination").eq("business_id",booking.business_id).maybeSingle():{data:null};
   metaPixelId=typeof website?.meta_pixel_id==="string"&&/^[0-9]{8,24}$/.test(website.meta_pixel_id.trim())?website.meta_pixel_id.trim():null;
   if(website?.status==="published")homeHref=website.domain_status==="connected"&&website.custom_domain?`https://${website.custom_domain}`:`/sites/${encodeURIComponent(website.public_slug)}`;
   else if(db&&booking?.business_id){const {data:bookingPage}=await db.from("booking_settings").select("public_slug").eq("business_id",booking.business_id).maybeSingle();if(bookingPage?.public_slug)homeHref=`/book/${encodeURIComponent(bookingPage.public_slug)}`;}
   const {data:paymentAccount}=db&&booking?.business_id?await db.from("business_payment_accounts").select("provider_account_id").eq("business_id",booking.business_id).eq("provider","stripe").maybeSingle():{data:null};
   session=await stripe.checkout.sessions.retrieve(sessionId,{},paymentAccount?.provider_account_id?{stripeAccount:paymentAccount.provider_account_id}:undefined);
   if(booking&&session.metadata?.booking_id!==booking.id)throw new Error("Checkout Session did not match the reservation.");
   isInitialOnlineRentalCheckout=Boolean(booking&&session.metadata?.booking_id===booking.id&&!session.metadata?.payment_kind);
   bookingConfirmed=booking?.status==="confirmed";
   googleAdsTagId=normalizeGoogleAdsTagId(website?.google_ads_tag_id);
   googleAdsBookingConversionDestination=normalizeGoogleAdsConversionDestination(website?.google_ads_booking_conversion_destination,googleAdsTagId);
   googleAdsBusinessId=booking?.business_id??null;
  }catch(error){
   if(error&&typeof error==="object"&&"digest" in error&&String(error.digest).includes("404"))throw error;
   console.error("Could not retrieve Stripe Checkout session:",error);
  }
 }
 const paid=session?.payment_status==="paid",rentalDate=session?.metadata?.rental_date,prettyDate=rentalDate?new Date(`${rentalDate}T12:00:00`).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"}):null,bookingNumber=session?.metadata?.booking_number,depositCents=Number(session?.amount_total||0),discountCents=Number(session?.total_details?.amount_discount||0),totalCents=bookingTotalCents??0,balanceCents=Math.max(0,totalCents-depositCents-discountCents);
 return <main className="section alt">
  {includeTenantGoogleTag&&googleAdsBusinessId&&<TenantGoogleAdsTag tagId={googleAdsTagId} scope={googleAdsBusinessId}/>}
  {metaPixelId&&<TenantMetaPixel pixelId={metaPixelId}/>}<div className="container"><div className="form-card" style={{maxWidth:720,margin:"0 auto",textAlign:"center"}}>
   <span className="eyebrow">{paid?"Payment received":"Payment verification"}</span><h2>{paid?"Your reservation is confirmed!":"We could not verify payment yet."}</h2>
   {bookingNumber&&<p className="lead">Confirmation number: <strong>#{bookingNumber}</strong></p>}{prettyDate&&<p className="lead">Rental date: <strong>{prettyDate}</strong></p>}
   {paid?<>{bookingId&&<TenantMetaPixelPurchaseTracker bookingId={bookingId} contentIds={String(session?.metadata?.inventory_item_ids??"").split(",").map(value=>value.trim()).filter(Boolean)} numItems={Math.max(1,Number(session?.metadata?.item_count??0))} value={totalCents>0?totalCents/100:undefined} currency={session?.currency?.toUpperCase()??"USD"}/>} {isInitialOnlineRentalCheckout&&bookingId&&bookingTotalCents!==null&&<GoogleAdsBookingConversion bookingId={bookingId} destination={googleAdsBookingConversionDestination} totalCents={bookingTotalCents} currency="USD" confirmed={bookingConfirmed} confirmationStatusUrl={`/api/public-booking-conversion-status?session_id=${encodeURIComponent(sessionId??"")}`}/>}<p className="lead">Non-refundable deposit paid: <strong>{money(depositCents)}</strong></p>{discountCents>0&&<p className="lead">Promotion discount: <strong>{money(discountCents)}</strong></p>}<p className="muted">Remaining balance: <strong>{money(balanceCents)}</strong>. Keep your confirmation number for your records.</p></>:<p className="muted">Please check your email for a Stripe receipt. Contact {businessName} if you completed payment but still see this message.</p>}
   <div className="actions" style={{justifyContent:"center"}}><Link className="button" href={homeHref}>Take me home</Link><Link className="button secondary" href={calendarHref}>View Calendar</Link></div>
  </div></div></main>;
}
