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
type DomainResolutionRoute="/sites/domain/[domain]"|"/sites/domain/[domain]/booking"|"/sites/domain/[domain]/mechanical-bull-rental";
type DomainLookupFailureKind="timeout"|"supabase_api_error"|"network_error"|"unexpected_error";
type DomainLookupContext={domain:string;route:DomainResolutionRoute;operation:string;table:string;attempt:number;startedAt:number};
type DomainLookupFailure={kind:DomainLookupFailureKind;message:string;code:string|null;status:number|null;temporary:boolean;table:string;operation:string;attempt:number;elapsedMs:number};
export type DomainSiteResolution=
 |{kind:"ok";settings:WebsiteRow;site:BusinessSiteData;elapsedMs:number;attemptCount:number}
 |{kind:"not_found";elapsedMs:number;attemptCount:number}
 |{kind:"unavailable";failure:DomainLookupFailure;elapsedMs:number;attemptCount:number};

const domainLookupTimeoutMs=2_500;
const domainLookupRetryDelayMs=150;
const domainCandidatesFor=(value:string)=>{
 const normalized=normalizeWebsiteDomain(value);
 if(!normalized)return [];
 return normalized.startsWith("www.")
  ?[normalized,normalized.slice(4)]
  :[normalized,`www.${normalized}`];
};

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const nowMs=()=>Date.now();
const statusFromCode=(code:string|null)=>{
 if(!code)return null;
 const match=code.match(/\b(\d{3})\b/);
 return match?Number(match[1]):null;
};
const classifySupabaseFailure=(error:unknown,context:DomainLookupContext):DomainLookupFailure=>{
 const elapsedMs=nowMs()-context.startedAt;
 if(error&&typeof error==="object"&&"kind" in error&&error.kind==="timeout"){
  return {kind:"timeout",message:"Domain lookup timed out.",code:"timeout",status:503,temporary:true,table:context.table,operation:context.operation,attempt:context.attempt,elapsedMs};
 }
 const value=error as {code?:string;message?:string;details?:string;hint?:string;name?:string;status?:number};
 const message=`${value?.message??value?.details??value?.hint??value?.name??String(error)}`;
 const rawCode=value?.code?String(value.code):null;
 const status=value?.status??statusFromCode(rawCode)??(/timeout|timed out/i.test(message)?503:null);
 const temporary=status!==null&&status>=500||/timeout|timed out|network|fetch failed|socket|connection|econn|etimedout/i.test(message);
 const kind=temporary
  ?/timeout|timed out/i.test(message)||rawCode==="timeout"?"timeout":status!==null?"supabase_api_error":"network_error"
  :"unexpected_error";
 return {kind,message,code:rawCode,status,temporary,table:context.table,operation:context.operation,attempt:context.attempt,elapsedMs};
};
const logDomainLookupOutcome=(level:"info"|"warn"|"error",payload:{domain:string;route:DomainResolutionRoute;operation:string;table:string;statusOrCode:number|string|null;message:string;elapsedMs:number;response:"404"|"503"|"200";attempt:number})=>{
 console[level]("Custom-domain resolution",payload);
};
async function withDomainLookupTimeout<T>(promise:PromiseLike<T>){
 return Promise.race<T>([
  promise,
  new Promise<T>((_,reject)=>setTimeout(()=>reject({kind:"timeout"}),domainLookupTimeoutMs)),
 ]);
}
async function runDomainQuery<T>(factory:()=>PromiseLike<{data:T|null;error:unknown|null}>,context:Omit<DomainLookupContext,"attempt"|"startedAt">){
 const startedAt=nowMs();
 let lastFailure:DomainLookupFailure|null=null;
 for(let attempt=1;attempt<=2;attempt++){
  const attemptContext={...context,attempt,startedAt};
  try{
   const result=await withDomainLookupTimeout(factory());
   if(result.error){
    const failure=classifySupabaseFailure(result.error,attemptContext);
    logDomainLookupOutcome(failure.temporary?"warn":"error",{domain:context.domain,route:context.route,operation:context.operation,table:context.table,statusOrCode:failure.status??failure.code,message:failure.message,elapsedMs:failure.elapsedMs,response:failure.temporary?"503":"404",attempt});
    lastFailure=failure;
   }else return {kind:"ok" as const,data:result.data,elapsedMs:nowMs()-startedAt,attemptCount:attempt};
  }catch(error){
   const failure=classifySupabaseFailure(error,attemptContext);
   logDomainLookupOutcome("warn",{domain:context.domain,route:context.route,operation:context.operation,table:context.table,statusOrCode:failure.status??failure.code,message:failure.message,elapsedMs:failure.elapsedMs,response:"503",attempt});
   lastFailure=failure;
  }
  if(!lastFailure?.temporary||attempt===2)break;
  await sleep(domainLookupRetryDelayMs*attempt);
 }
 return {kind:"error" as const,failure:lastFailure??{kind:"unexpected_error",message:"Domain lookup failed.",code:null,status:null,temporary:false,table:context.table,operation:context.operation,attempt:2,elapsedMs:nowMs()-startedAt},elapsedMs:nowMs()-startedAt,attemptCount:lastFailure?.attempt??2};
}
export const domainLookupTestUtils={classifySupabaseFailure,runDomainQuery};
const sanitizeMetaPixelId=(value:unknown)=>{
 if(typeof value!=="string")return null;
 const normalized=value.trim();
 return /^[0-9]{8,24}$/.test(normalized)?normalized:null;
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
  db.from("inventory_items").select("id,name,category,category_id,description,daily_price_cents,image_url,length_ft,width_ft,height_ft,standard_rental_hours_override,allow_multi_day_override,additional_day_pricing_type_override,additional_day_discount_percent_override,additional_day_flat_rate_cents_override,max_rental_days_override").eq("business_id",businessId).eq("active",true),
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
 const isJunkRemoval=websiteOnboarding?.source==="junk-removal-website"||business.industry_profile==="junk_removal";
 // Party-rental websites are booking-first. Once Online Booking itself is
 // enabled, do not let a stale/omitted website checkbox hide the embedded
 // inventory calendar from the public site.
 const bookingEnabled=Boolean(bookingSlug&&(business.industry_profile==="party_rental"||(!isJunkRemoval&&settings.booking_enabled&&booking?.enabled)));
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
 const popupEnabled=Boolean(settings.lead_capture_popup_enabled);
 const popupDiscountType=settings.lead_capture_popup_discount_type==="percentage"||settings.lead_capture_popup_discount_type==="custom"?"percentage"===settings.lead_capture_popup_discount_type?"percentage":"custom":"fixed";
 return {
  bookingSlug,customDomain:settings.domain_status==="connected"&&settings.custom_domain?normalizeWebsiteDomain(String(settings.custom_domain)):null,name:business.name,phone:business.phone,email:business.email,logoUrl:signedLogo?.signedUrl??booking?.logo_url??null,industryProfile:business.industry_profile,websiteSource:websiteOnboarding?.source??null,
  metaPixelId:sanitizeMetaPixelId(settings.meta_pixel_id),
  template:settings.template_key??"modern",primaryColor:settings.primary_color??booking?.brand_color??business.primary_color??"#1769f5",secondaryColor:settings.secondary_color??"#0b1733",floralFontStyle:settings.floral_font_style??"elegant",floralAccentColor:settings.floral_accent_color??"#b85c7c",floralBackgroundColor:settings.floral_background_color??"#fffafc",floralPhotoLayout:settings.floral_photo_layout??"hero_right",
  heroHeading:settings.hero_heading??(isJunkRemoval?"Got Junk? We’ll Make It Disappear.":`${business.name} keeps your home or business running smoothly.`),
  heroSubheading:settings.hero_subheading??(isJunkRemoval?"Furniture, appliances, yard debris, garage cleanouts, and more. Tell us what needs to go and we’ll take care of the heavy lifting.":"Reliable local service, clear communication, and a team that is ready when you need help."),
  aboutText:settings.about_text??(isJunkRemoval?`${business.name} helps homeowners and businesses clear out unwanted items with fast response, upfront estimates, and dependable local service.`:`${business.name} is a local service business committed to dependable work and a straightforward customer experience. Tell us what you need and our team will help you take the next step.`),instagramUrl:settings.instagram_url??null,
  googleReviewUrl:googleRating?.googleMapsUri??settings.google_review_url,googleRating:googleProfile?.rating??googleRating?.rating??null,googleReviewCount:googleProfile?.reviewCount??googleRating?.reviewCount??null,googleReviews:googleProfile?.reviews.length?googleProfile.reviews.map(review=>({...review,fromGoogleProfile:true})):manualReviews,photoUrls:(settings.photo_urls??[]).filter(Boolean),photoMotionStyle:settings.photo_motion_style==="ken_burns"?"ken_burns":"static",requestEnabled:settings.request_service_enabled??true,
  bookingEnabled,bookingUrl:bookingEnabled&&bookingSlug?`${platformUrl}/book/${encodeURIComponent(bookingSlug)}`:null,
  announcementText:promotion?.announcement_text??null,
  leadCapturePopup:{
   enabled:popupEnabled,
   headline:settings.lead_capture_popup_headline??`Get $25 off your first booking with ${business.name}`,
   body:settings.lead_capture_popup_body??"Enter your email and we'll send you your discount.",
   discountType:popupDiscountType,
   discountValue:settings.lead_capture_popup_discount_value==null?null:Number(settings.lead_capture_popup_discount_value),
   customOffer:settings.lead_capture_popup_custom_offer??null,
   couponCode:settings.lead_capture_popup_coupon_code??null,
   ctaText:settings.lead_capture_popup_cta_text??"Get my discount",
   delaySeconds:Math.min(60,Math.max(1,Number(settings.lead_capture_popup_delay_seconds??7))),
   expiresAt:settings.lead_capture_popup_expires_at??null,
   serviceId:settings.lead_capture_popup_service_id??null,
   inventoryItemId:settings.lead_capture_popup_inventory_item_id??null,
   minimumSubtotalCents:settings.lead_capture_popup_minimum_subtotal_cents==null?null:Number(settings.lead_capture_popup_minimum_subtotal_cents),
   successMessage:settings.lead_capture_popup_success_message??"You're in! Your discount is ready to use.",
   disclosure:settings.lead_capture_popup_disclosure??`By submitting, you agree to receive promotional emails from ${business.name}. You can unsubscribe anytime.`,
   fingerprint:String(settings.updated_at??settings.public_slug??business.id),
  },
  services:(services??[]).map((service:any)=>({...service,price_amount:service.price_amount===null?null:Number(service.price_amount)})),
  rentalItems:(rentalItems??[]).sort((left:any,right:any)=>{const a=rentalCategoryOrder.get(left.category_id)??{rank:Number.MAX_SAFE_INTEGER,name:left.category||"Other rentals"},b=rentalCategoryOrder.get(right.category_id)??{rank:Number.MAX_SAFE_INTEGER,name:right.category||"Other rentals"};return a.rank-b.rank||String(a.name).localeCompare(String(b.name))||String(left.name).localeCompare(String(right.name));}).map((item:any)=>{const rules=resolveRentalPricingRules({standardRentalHours:Number(booking?.standard_rental_hours??24),allowMultiDay:Boolean(booking?.allow_multi_day_rentals),additionalDayPricingType:(booking?.additional_day_pricing_type??"full_price") as AdditionalDayPricingType,additionalDayDiscountPercent:Number(booking?.additional_day_discount_percent??0),additionalDayFlatRateCents:booking?.additional_day_flat_rate_cents==null?null:Number(booking.additional_day_flat_rate_cents),maxRentalDays:booking?.max_rental_days==null?null:Number(booking.max_rental_days)},item);return{id:item.id,name:item.name,category:item.category??null,description:item.description??null,dailyPriceCents:Number(item.daily_price_cents??0),imageUrl:item.image_url??null,lengthFt:item.length_ft==null?null:Number(item.length_ft),widthFt:item.width_ft==null?null:Number(item.width_ft),heightFt:item.height_ft==null?null:Number(item.height_ft),standardRentalHours:rules.standardRentalHours,multiDayMessage:rules.allowMultiDay?rentalPricingMessage(rules):null}}),
  hours:(hours??[]).map((hour:any)=>({weekday:Number(hour.weekday),start:hour.start_time,end:hour.end_time})),serviceAreas:areas.length?areas:fallbackArea?[fallbackArea]:[],
 };
}

const publicWebsiteSettingsSelect="business_id,public_slug,status,template_key,primary_color,secondary_color,hero_heading,hero_subheading,about_text,google_place_id,google_review_url,google_reviews,photo_urls,photo_motion_style,request_service_enabled,booking_enabled,instagram_url,custom_domain,domain_status,meta_pixel_id,floral_font_style,floral_accent_color,floral_background_color,floral_photo_layout,lead_capture_popup_enabled,lead_capture_popup_headline,lead_capture_popup_body,lead_capture_popup_discount_type,lead_capture_popup_discount_value,lead_capture_popup_custom_offer,lead_capture_popup_coupon_code,lead_capture_popup_cta_text,lead_capture_popup_delay_seconds,lead_capture_popup_expires_at,lead_capture_popup_service_id,lead_capture_popup_inventory_item_id,lead_capture_popup_minimum_subtotal_cents,lead_capture_popup_success_message,lead_capture_popup_disclosure,updated_at";
const legacyPublicWebsiteSettingsSelect="business_id,public_slug,status,template_key,primary_color,secondary_color,hero_heading,hero_subheading,about_text,google_place_id,google_review_url,google_reviews,photo_urls,request_service_enabled,booking_enabled,instagram_url,custom_domain,domain_status,meta_pixel_id,floral_font_style,floral_accent_color,floral_background_color,floral_photo_layout,lead_capture_popup_enabled,lead_capture_popup_headline,lead_capture_popup_body,lead_capture_popup_discount_type,lead_capture_popup_discount_value,lead_capture_popup_custom_offer,lead_capture_popup_coupon_code,lead_capture_popup_cta_text,lead_capture_popup_delay_seconds,lead_capture_popup_expires_at,lead_capture_popup_service_id,lead_capture_popup_inventory_item_id,lead_capture_popup_minimum_subtotal_cents,lead_capture_popup_success_message,lead_capture_popup_disclosure,updated_at";

const isMissingPhotoMotionStyleColumnError=(error:unknown)=>{
 const value=error as {code?:string;message?:string;details?:string;hint?:string}|null;
 const message=`${value?.message??value?.details??value?.hint??""}`;
 return value?.code==="42703"&&/photo_motion_style/i.test(message);
};

async function queryWebsiteSettingsByDomain(
 db: SupabaseClient,
 candidates: string[],
 filters: { status?: string; domainStatus?: string },
 context: { domain: string; route: DomainResolutionRoute; operation: string },
){
 const runSelect=(selectClause:string)=>db.from("business_website_settings").select(selectClause).in("custom_domain",candidates)
  .match({
   ...(filters.status?{status:filters.status}:{}),
   ...(filters.domainStatus?{domain_status:filters.domainStatus}:{}),
  })
  .limit(1);

 const primaryResult=await runDomainQuery(()=>runSelect(publicWebsiteSettingsSelect),{
  domain:context.domain,
  route:context.route,
  operation:context.operation,
  table:"business_website_settings",
 });
 if(primaryResult.kind==="ok")return primaryResult;
 if(!isMissingPhotoMotionStyleColumnError(primaryResult.failure))return primaryResult;

 logDomainLookupOutcome("warn",{
  domain:context.domain,
  route:context.route,
  operation:`${context.operation}_legacy_retry`,
  table:"business_website_settings",
  statusOrCode:primaryResult.failure.code??primaryResult.failure.status,
  message:"Retrying domain lookup without photo_motion_style because the column is missing.",
  elapsedMs:primaryResult.elapsedMs,
  response:"503",
  attempt:primaryResult.attemptCount,
 });

 const legacyResult=await runDomainQuery(()=>runSelect(legacyPublicWebsiteSettingsSelect),{
  domain:context.domain,
  route:context.route,
  operation:`${context.operation}_legacy`,
  table:"business_website_settings",
 });
 if(legacyResult.kind!=="ok")return legacyResult;
 return {
  ...legacyResult,
  data:(legacyResult.data??[]).map((row:any)=>({photo_motion_style:"static",...row})),
 };
}

async function queryPublishedBusinessWebsiteByDomain(rawDomain:string,route:DomainResolutionRoute):Promise<DomainSiteResolution>{
 const db=getSupabaseAdmin(),candidates=domainCandidatesFor(rawDomain);
 if(!db||!candidates.length)return {kind:"not_found",elapsedMs:0,attemptCount:0};
 const publishedResult=await queryWebsiteSettingsByDomain(db,candidates,{status:"published"},{domain:rawDomain,route,operation:"resolve_published_domain"});
 if(publishedResult.kind==="error")return {kind:"unavailable",failure:publishedResult.failure,elapsedMs:publishedResult.elapsedMs,attemptCount:publishedResult.attemptCount};
 const publishedSettings=publishedResult.data?.[0]??null;
 if(publishedSettings){
  const site=await loadBusinessWebsiteData(db,publishedSettings,{includeExternalReviews:false});
  if(!site)return {kind:"not_found",elapsedMs:publishedResult.elapsedMs,attemptCount:publishedResult.attemptCount};
  logDomainLookupOutcome("info",{domain:rawDomain,route,operation:"resolve_published_domain",table:"business_website_settings",statusOrCode:200,message:"Resolved custom domain.",elapsedMs:publishedResult.elapsedMs,response:"200",attempt:publishedResult.attemptCount});
  return {kind:"ok",settings:publishedSettings,site,elapsedMs:publishedResult.elapsedMs,attemptCount:publishedResult.attemptCount};
 }
 const connectedResult=await queryWebsiteSettingsByDomain(db,candidates,{domainStatus:"connected"},{domain:rawDomain,route,operation:"resolve_connected_domain"});
 if(connectedResult.kind==="error")return {kind:"unavailable",failure:connectedResult.failure,elapsedMs:publishedResult.elapsedMs+connectedResult.elapsedMs,attemptCount:publishedResult.attemptCount+connectedResult.attemptCount};
 const settings=connectedResult.data?.[0]??null;
 if(!settings){
  logDomainLookupOutcome("info",{domain:rawDomain,route,operation:"resolve_connected_domain",table:"business_website_settings",statusOrCode:404,message:"No matching custom domain found.",elapsedMs:publishedResult.elapsedMs+connectedResult.elapsedMs,response:"404",attempt:publishedResult.attemptCount+connectedResult.attemptCount});
  return {kind:"not_found",elapsedMs:publishedResult.elapsedMs+connectedResult.elapsedMs,attemptCount:publishedResult.attemptCount+connectedResult.attemptCount};
 }
 const site=await loadBusinessWebsiteData(db,settings,{includeExternalReviews:false});
 if(!site){
  logDomainLookupOutcome("info",{domain:rawDomain,route,operation:"hydrate_website",table:"businesses",statusOrCode:404,message:"Domain matched but no active business website data was available.",elapsedMs:publishedResult.elapsedMs+connectedResult.elapsedMs,response:"404",attempt:publishedResult.attemptCount+connectedResult.attemptCount});
  return {kind:"not_found",elapsedMs:publishedResult.elapsedMs+connectedResult.elapsedMs,attemptCount:publishedResult.attemptCount+connectedResult.attemptCount};
 }
 logDomainLookupOutcome("info",{domain:rawDomain,route,operation:"resolve_connected_domain",table:"business_website_settings",statusOrCode:200,message:"Resolved connected custom domain.",elapsedMs:publishedResult.elapsedMs+connectedResult.elapsedMs,response:"200",attempt:publishedResult.attemptCount+connectedResult.attemptCount});
 return {kind:"ok",settings,site,elapsedMs:publishedResult.elapsedMs+connectedResult.elapsedMs,attemptCount:publishedResult.attemptCount+connectedResult.attemptCount};
}

const loadCachedPublishedBusinessWebsiteByDomain=unstable_cache(async(rawDomain:string)=>{
 const result=await queryPublishedBusinessWebsiteByDomain(rawDomain,"/sites/domain/[domain]");
 return result.kind==="ok"?result:null;
},["published-business-website-domain"],{revalidate:300});

export async function loadPublishedBusinessWebsiteByDomain(rawDomain:string,route:DomainResolutionRoute="/sites/domain/[domain]"):Promise<DomainSiteResolution>{
 const cached=await loadCachedPublishedBusinessWebsiteByDomain(rawDomain);
 if(cached){
  logDomainLookupOutcome("info",{domain:rawDomain,route,operation:"resolve_cached_domain",table:"business_website_settings",statusOrCode:200,message:"Resolved custom domain from cache.",elapsedMs:0,response:"200",attempt:0});
  return {...cached,elapsedMs:0,attemptCount:0};
 }
 return queryPublishedBusinessWebsiteByDomain(rawDomain,route);
}
