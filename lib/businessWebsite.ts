import type {SupabaseClient} from "@supabase/supabase-js";
import type {BusinessSiteData} from "@/components/BusinessWebsite";

type WebsiteRow=Record<string,any>;
export async function loadBusinessWebsiteData(db:SupabaseClient,settings:WebsiteRow):Promise<BusinessSiteData|null>{
 const [{data:business},{data:services},{data:hours},{data:territories},{data:booking}]=await Promise.all([
  db.from("businesses").select("id,name,phone,email,primary_color,address_line1,city,state,postal_code").eq("id",settings.business_id).eq("is_deleted",false).maybeSingle(),
  db.from("services").select("id,name,description,price_amount,price_label").eq("business_id",settings.business_id).eq("active",true).eq("is_deleted",false).order("sort_order").order("name"),
  db.from("booking_availability").select("weekday,start_time,end_time").eq("business_id",settings.business_id).eq("active",true).order("weekday"),
  db.from("workforce_territories").select("name,postal_codes,neighborhoods,strategy_config").eq("business_id",settings.business_id).eq("is_active",true).order("name"),
  db.from("booking_settings").select("enabled,public_slug,logo_path,logo_url,brand_color").eq("business_id",settings.business_id).maybeSingle(),
 ]);
 if(!business)return null;
 const {data:signedLogo}=booking?.logo_path?await db.storage.from("booking-branding").createSignedUrl(booking.logo_path,3600):{data:null};
 const areas=[...new Set((territories??[]).flatMap((territory:any)=>[
  territory.name,...(territory.strategy_config?.cities??[]),...(territory.neighborhoods??[]),...(territory.postal_codes??[]).map((zip:string)=>`ZIP ${zip}`),
 ]).filter(Boolean))].slice(0,30) as string[];
 const fallbackArea=[business.city,business.state].filter(Boolean).join(", ");
 return {
  name:business.name,phone:business.phone,email:business.email,logoUrl:signedLogo?.signedUrl??booking?.logo_url??null,
  template:settings.template_key??"modern",primaryColor:settings.primary_color??booking?.brand_color??business.primary_color??"#1769f5",secondaryColor:settings.secondary_color??"#0b1733",
  heroHeading:settings.hero_heading??`${business.name} keeps your home or business running smoothly.`,
  heroSubheading:settings.hero_subheading??"Reliable local service, clear communication, and a team that is ready when you need help.",
  aboutText:settings.about_text??`${business.name} is a local service business committed to dependable work and a straightforward customer experience. Tell us what you need and our team will help you take the next step.`,
  googleReviewUrl:settings.google_review_url,photoUrls:(settings.photo_urls??[]).filter(Boolean),requestEnabled:settings.request_service_enabled??true,
  bookingEnabled:Boolean(settings.booking_enabled&&booking?.enabled),bookingUrl:settings.booking_enabled&&booking?.enabled?`/book/${booking.public_slug}`:null,
  services:(services??[]).map((service:any)=>({...service,price_amount:service.price_amount===null?null:Number(service.price_amount)})),
  hours:(hours??[]).map((hour:any)=>({weekday:Number(hour.weekday),start:hour.start_time,end:hour.end_time})),serviceAreas:areas.length?areas:fallbackArea?[fallbackArea]:[],
 };
}
