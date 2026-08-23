import type {SupabaseClient} from "@supabase/supabase-js";
import {unstable_cache} from "next/cache";
import type {BusinessSiteData} from "@/components/BusinessWebsite";
import {getGoogleBusinessRating} from "@/lib/googleBusinessPlace";
import {getGoogleBusinessProfileReviews} from "@/lib/googleBusinessProfile";
import {rentalPricingMessage,resolveRentalPricingRules,type AdditionalDayPricingType} from "@/lib/rentalPricing";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {normalizeWebsiteDomain} from "@/lib/website";

type WebsiteRow=Record<string,any>;
type LoadBusinessWebsiteDataOptions={includeExternalReviews?:boolean};
type QueryResult<T>={data:T|null;error:unknown|null};
const domainCandidatesFor=(value:string)=>{
 const normalized=normalizeWebsiteDomain(value);
 if(!normalized)return [];
 return normalized.startsWith("www.")
  ?[normalized,normalized.slice(4)]
  :[normalized,`www.${normalized}`];
};

const normalizeQueryResult=<T,>(result:PromiseSettledResult<{data:T|null;error:unknown|null}>,label:string,businessId:string):QueryResult<T>=>{
 if(result.status==="fulfilled"){
  if(result.value.error){
   const value=result.value.error as {code?:string;message?:string;details?:string;hint?:string;name?:string};
   console.warn("Business website data query failed",{businessId,label,code:value.code??null,message:value.message??value.name??String(result.value.error),details:value.details??null,hint:value.hint??null});
  }
  return result.value;
 }
 console.warn("Business website data query rejected",{businessId,label,message:result.reason instanceof Error?result.reason.message:String(result.reason)});
 return {data:null,error:result.reason};
};

export async function loadBusinessWebsiteData(db:SupabaseClient,settings:WebsiteRow,options:LoadBusinessWebsiteDataOptions={}):Promise<BusinessSiteData|null>{
 const {includeExternalReviews=false}=options;
 const businessId=String(settings.business_id);
 const [businessResult,servicesResult,rentalItemsResult,rentalCategoriesResult,hoursResult,territoriesResult,bookingResult,websiteOnboardingResult,promotionResult]=await Promise.allSettled([
  db.from("businesses").select("id,name,slug,phone,email,primary_color,address_line1,city,state,postal_code,industry_profile").eq("id",businessId).eq("is_deleted",false).maybeSingle(),
  db.from("services").select("id,name,description,price_amount,price_label").eq("business_id",businessId).eq("active",true).eq("is_deleted",false).order("sort_order").order("name"),
  db.from("inventory_items").select("id,name,category,category_id,description,daily_price_cents,image_url,standard_rental_hours_override,allow_multi_day_override,additional_day_pricing_type_override,additional_day_discount_percent_override,additional_day_flat_rate_cents_override,max_rental_days_override").eq("business_id",businessId).eq("active",true),
  db.from("rental_inventory_categories").select("id,name,sort_order").eq("business_id",businessId).order("sort_order").order("name"),
  db.from("booking_availability").select("weekday,start_time,end_time").eq("business_id",businessId).eq("active",true).order("weekday"),
  db.from("workforce_territories").select("name,postal_codes,neighborhoods,strategy_config").eq("business_id",businessId).eq("is_active",true).order("name"),
  db.from("booking_settings").select("enabled,public_slug,logo_path,logo_url,brand_color,standard_rental_hours,allow_multi_day_rentals,additional_day_pricing_type,additional_day_discount_percent,additional_day_flat_rate_cents,max_rental_days").eq("business_id",businessId).maybeSingle(),
  db.from("business_website_onboarding_states").select("source").eq("business_id",businessId).maybeSingle(),
  db.from("discounts").select("announcement_text").eq("business_id",businessId).eq("is_active",true).eq("announcement_enabled",true).or(`starts_at.is.null,starts_at.lte.${new Date().toISOString()}`).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("created_at",{ascending:false}).limit(1).maybeSingle(),
 ]);
 const {data:business}=normalizeQueryResult(businessResult,"businesses",businessId);
 const {data:services}=normalizeQueryResult(servicesResult,"services",businessId);
 const {data:rentalItems}=normalizeQueryResult(rentalItemsResult,"inventory_items",businessId);
 const {data:rentalCategories}=normalizeQueryResult(rentalCategoriesResult,"rental_inventory_categories",businessId);
 const {data:hours}=normalizeQueryResult(hoursResult,"booking_availability",businessId);
 const {data:territories}=normalizeQueryResult(territoriesResult,"workforce_territories",businessId);
 const {data:booking}=normalizeQueryResult(bookingResult,"booking_settings",businessId);
 const {data:websiteOnboarding}=normalizeQueryResult(websiteOnboardingResult,"business_website_onboarding_states",businessId);
 const {data:promotion}=normalizeQueryResult(promotionResult,"discounts",businessId);
 if(!business)return null;
 let signedLogo:{signedUrl?:string}|null=null;
 if(booking?.logo_path){
  try{
   const result=await db.storage.from("booking-branding").createSignedUrl(booking.logo_path,3600);
   if(result.error){
    const value=result.error as {message?:string;name?:string};
    console.warn("Business website logo signing failed",{businessId,message:value.message??value.name??String(result.error)});
   }else signedLogo=result.data;
  }catch(error){
   console.warn("Business website logo signing rejected",{businessId,message:error instanceof Error?error.message:String(error)});
  }
 }
 const areas=[...new Set((territories??[]).flatMap((territory:any)=>[
  territory.name,...(territory.strategy_config?.cities??[]),...(territory.neighborhoods??[]),...(territory.postal_codes??[]).map((zip:string)=>`ZIP ${zip}`),
 ]).filter(Boolean))].slice(0,30) as string[];
 const fallbackArea=[business.city,business.state].filter(Boolean).join(", ");
 const platformUrl=(process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||"https://servonas.com").replace(/\/$/,"");
 const bookingSlug=booking?.public_slug?String(booking.public_slug):settings.public_slug?String(settings.public_slug):business.slug?String(business.slug):null;
 // Party-rental websites are booking-first. Once Online Booking itself is
 // enabled, do not let a stale/omitted website checkbox hide the embedded
 // inventory calendar from the public site.
 const bookingEnabled=Boolean(bookingSlug&&(business.industry_profile==="party_rental"||settings.booking_enabled&&booking?.enabled));
 let googleProfile:null|Awaited<ReturnType<typeof getGoogleBusinessProfileReviews>>=null;
 let googleRating:null|Awaited<ReturnType<typeof getGoogleBusinessRating>>=null;
 if(includeExternalReviews){
  try{
   googleProfile=await getGoogleBusinessProfileReviews(business.id);
  }catch(error){
   console.warn("Google business profile review fetch failed",{businessId,message:error instanceof Error?error.message:String(error)});
  }
  if(!googleProfile&&settings.google_place_id){
   try{
    googleRating=await getGoogleBusinessRating(String(settings.google_place_id));
   }catch(error){
    console.warn("Google business rating fetch failed",{businessId,message:error instanceof Error?error.message:String(error)});
   }
  }
 }
 const manualReviews=(Array.isArray(settings.google_reviews)?settings.google_reviews:[]).filter((review:any)=>review&&typeof review.author==="string"&&typeof review.text==="string"&&Number.isInteger(review.rating)&&review.rating>=1&&review.rating<=5).slice(0,6);
 const rentalCategoryOrder=new Map((rentalCategories??[]).map((category:any,index:number)=>[category.id,{rank:index,name:category.name}]));
 return {
  bookingSlug,customDomain:settings.domain_status==="connected"&&settings.custom_domain?normalizeWebsiteDomain(String(settings.custom_domain)):null,name:business.name,phone:business.phone,email:business.email,logoUrl:signedLogo?.signedUrl??booking?.logo_url??null,industryProfile:business.industry_profile,websiteSource:websiteOnboarding?.source??null,
  template:settings.template_key??"modern",primaryColor:settings.primary_color??booking?.brand_color??business.primary_color??"#1769f5",secondaryColor:settings.secondary_color??"#0b1733",floralFontStyle:settings.floral_font_style??"elegant",floralAccentColor:settings.floral_accent_color??"#b85c7c",floralBackgroundColor:settings.floral_background_color??"#fffafc",floralPhotoLayout:settings.floral_photo_layout??"hero_right",
  heroHeading:settings.hero_heading??`${business.name} keeps your home or business running smoothly.`,
  heroSubheading:settings.hero_subheading??"Reliable local service, clear communication, and a team that is ready when you need help.",
  aboutText:settings.about_text??`${business.name} is a local service business committed to dependable work and a straightforward customer experience. Tell us what you need and our team will help you take the next step.`,instagramUrl:settings.instagram_url??null,
  googleReviewUrl:googleRating?.googleMapsUri??settings.google_review_url,googleRating:googleProfile?.rating??googleRating?.rating??null,googleReviewCount:googleProfile?.reviewCount??googleRating?.reviewCount??null,googleReviews:googleProfile?.reviews.length?googleProfile.reviews.map(review=>({...review,fromGoogleProfile:true})):manualReviews,photoUrls:(settings.photo_urls??[]).filter(Boolean),requestEnabled:settings.request_service_enabled??true,
  bookingEnabled,bookingUrl:bookingEnabled&&bookingSlug?`${platformUrl}/book/${encodeURIComponent(bookingSlug)}`:null,
  announcementText:promotion?.announcement_text??null,
  services:(services??[]).map((service:any)=>({...service,price_amount:service.price_amount===null?null:Number(service.price_amount)})),
  rentalItems:(rentalItems??[]).sort((left:any,right:any)=>{const a=rentalCategoryOrder.get(left.category_id)??{rank:Number.MAX_SAFE_INTEGER,name:left.category||"Other rentals"},b=rentalCategoryOrder.get(right.category_id)??{rank:Number.MAX_SAFE_INTEGER,name:right.category||"Other rentals"};return a.rank-b.rank||String(a.name).localeCompare(String(b.name))||String(left.name).localeCompare(String(right.name));}).map((item:any)=>{const rules=resolveRentalPricingRules({standardRentalHours:Number(booking?.standard_rental_hours??24),allowMultiDay:Boolean(booking?.allow_multi_day_rentals),additionalDayPricingType:(booking?.additional_day_pricing_type??"full_price") as AdditionalDayPricingType,additionalDayDiscountPercent:Number(booking?.additional_day_discount_percent??0),additionalDayFlatRateCents:booking?.additional_day_flat_rate_cents==null?null:Number(booking.additional_day_flat_rate_cents),maxRentalDays:booking?.max_rental_days==null?null:Number(booking.max_rental_days)},item);return{id:item.id,name:item.name,category:item.category??null,description:item.description??null,dailyPriceCents:Number(item.daily_price_cents??0),imageUrl:item.image_url??null,standardRentalHours:rules.standardRentalHours,multiDayMessage:rules.allowMultiDay?rentalPricingMessage(rules):null}}),
  hours:(hours??[]).map((hour:any)=>({weekday:Number(hour.weekday),start:hour.start_time,end:hour.end_time})),serviceAreas:areas.length?areas:fallbackArea?[fallbackArea]:[],
 };
}

const publicWebsiteSettingsSelect="business_id,public_slug,status,template_key,primary_color,secondary_color,hero_heading,hero_subheading,about_text,google_place_id,google_review_url,google_reviews,photo_urls,request_service_enabled,booking_enabled,instagram_url,custom_domain,domain_status,floral_font_style,floral_accent_color,floral_background_color,floral_photo_layout";
const logDomainLookupError=(label:string,domain:string,error:unknown)=>{
 if(!error)return;
 const value=error as {code?:string;message?:string;details?:string;hint?:string;name?:string};
 console.error(label,{domain,code:value.code??null,message:value.message??value.name??String(error),details:value.details??null,hint:value.hint??null});
};

async function queryPublishedBusinessWebsiteByDomain(rawDomain:string){
 const db=getSupabaseAdmin(),candidates=domainCandidatesFor(rawDomain);
 if(!db||!candidates.length)return null;
 const publishedQuery=await db.from("business_website_settings").select(publicWebsiteSettingsSelect).in("custom_domain",candidates).eq("status","published").limit(1);
 if(publishedQuery.error){
  logDomainLookupError("Published custom-domain website lookup failed",rawDomain,publishedQuery.error);
  return null;
 }
 const connectedQuery=!publishedQuery.data?.length?await db.from("business_website_settings").select(publicWebsiteSettingsSelect).in("custom_domain",candidates).eq("domain_status","connected").limit(1):{data:publishedQuery.data,error:null};
 if(connectedQuery.error){
  logDomainLookupError("Connected custom-domain website lookup failed",rawDomain,connectedQuery.error);
  return null;
 }
 const settings=(publishedQuery.data?.[0]??connectedQuery.data?.[0])??null;
 if(!settings)return null;
 const site=await loadBusinessWebsiteData(db,settings,{includeExternalReviews:false});
 return site?{settings,site}:null;
}

const loadCachedPublishedBusinessWebsiteByDomain=unstable_cache(queryPublishedBusinessWebsiteByDomain,["published-business-website-domain"],{revalidate:300});

export async function loadPublishedBusinessWebsiteByDomain(rawDomain:string){
 const cached=await loadCachedPublishedBusinessWebsiteByDomain(rawDomain);
 if(cached)return cached;
 return queryPublishedBusinessWebsiteByDomain(rawDomain);
}
