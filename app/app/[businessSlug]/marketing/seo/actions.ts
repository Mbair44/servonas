"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageBusiness } from "@/lib/access";
import { requireWorkspace } from "@/lib/workspace";
import {generateLocationPage,locationSourceVersion,type LocationPageSource} from "@/lib/locationPages";

const pagePath = (slug: string) => `/app/${encodeURIComponent(slug)}/marketing/seo`;
const destination = (slug: string, kind: "success" | "error", message: string) => `${pagePath(slug)}?${kind}=${encodeURIComponent(message)}`;
const editorPath=(slug:string,id:string)=>`${pagePath(slug)}/locations/${encodeURIComponent(id)}`;
const text=(value:FormDataEntryValue|null,max:number)=>typeof value==="string"?value.trim().slice(0,max):"";
type SeoTelemetry={actionName:string;businessSlug:string;operationId:string};
type SeoDatabaseResult={data?:any;error?:{code?:string;message?:string}|null;status?:number};

const databaseHttpStatus=(result:SeoDatabaseResult)=>result.status??(result.error?.code==="PGRST205"||result.error?.code==="42P01"?404:result.error?.code==="PGRST204"||result.error?.code==="42703"?400:null);
const sanitizeLogMessage=(value:unknown)=>typeof value==="string"?value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[email]").replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi,"[id]").replace(/Bearer\s+\S+/gi,"Bearer [redacted]").slice(0,300):null;
const safeDatabaseError=(error:SeoDatabaseResult["error"])=>error?{errorCode:error.code??null,sanitizedError:sanitizeLogMessage(error.message)}:{errorCode:null,sanitizedError:null};
const isNextRedirect=(error:unknown)=>typeof (error as {digest?:unknown})?.digest==="string"&&(error as {digest:string}).digest.startsWith("NEXT_REDIRECT");

async function databaseOperation(telemetry:SeoTelemetry,operationName:string,table:string,fatal:boolean,request:PromiseLike<SeoDatabaseResult>,method="GET"){
 const endpoint=`/rest/v1/${table}`,startedAt=Date.now();
 console.info("local_seo_downstream_started",{...telemetry,operationName,endpoint,method,fatal});
 const result=await request,durationMs=Date.now()-startedAt,httpStatus=databaseHttpStatus(result);
 if(result.error)console.error("local_seo_downstream_failed",{...telemetry,operationName,endpoint,method,httpStatus,durationMs,fatal,...safeDatabaseError(result.error)});
 else console.info("local_seo_downstream_completed",{...telemetry,operationName,endpoint,method,httpStatus:httpStatus??(method==="GET"?200:201),durationMs,fatal});
 return result;
}

async function locationPageSource(supabase:any,businessId:string,sourceLocationKey:string,telemetry:SeoTelemetry){
 const [businessResult,websiteResult,servicesResult,inventoryResult,territoriesResult,hoursResult,bookingResult]=await Promise.all([
  databaseOperation(telemetry,"load_business","businesses",true,supabase.from("businesses").select("name,industry_profile,industry_other,phone,email,city,state").eq("id",businessId).single()),
  databaseOperation(telemetry,"load_website_snapshot","business_website_settings",false,supabase.from("business_website_settings").select("public_slug,custom_domain,domain_status,hero_heading,hero_subheading,about_text,booking_enabled,request_service_enabled,google_reviews").eq("business_id",businessId).maybeSingle()),
  databaseOperation(telemetry,"load_services","services",false,supabase.from("services").select("name,description").eq("business_id",businessId).eq("active",true).eq("is_deleted",false).order("sort_order").limit(20)),
  databaseOperation(telemetry,"load_inventory","inventory_items",false,supabase.from("inventory_items").select("name,description,category").eq("business_id",businessId).eq("active",true).order("sort_order").limit(40)),
  databaseOperation(telemetry,"load_service_areas","workforce_territories",false,supabase.from("workforce_territories").select("name,strategy_config").eq("business_id",businessId).eq("is_active",true).order("name")),
  databaseOperation(telemetry,"load_business_hours","booking_availability",false,supabase.from("booking_availability").select("weekday,start_time,end_time").eq("business_id",businessId).eq("active",true).order("weekday")),
  databaseOperation(telemetry,"load_booking_settings","booking_settings",false,supabase.from("booking_settings").select("enabled,public_slug,standard_rental_hours,allow_multi_day_rentals").eq("business_id",businessId).maybeSingle()),
 ]);
 const business=businessResult.data,website=websiteResult.data,services=servicesResult.data??[],inventory=inventoryResult.data??[],territories=territoriesResult.data??[],hours=hoursResult.data??[],booking=bookingResult.data;
 if(businessResult.error||!business)throw new Error("business_source_unavailable");
 const [cityPart,statePart]=sourceLocationKey.split(",").map(part=>part.trim()),city=cityPart||sourceLocationKey.trim(),state=statePart||null;
 const customDomain=website?.domain_status==="connected"&&website.custom_domain?String(website.custom_domain).replace(/^https?:\/\//,"").replace(/\/$/,""):null;
 const publicSlug=website?.public_slug||booking?.public_slug;
 const baseUrl=customDomain?`https://${customDomain}`:`${(process.env.NEXT_PUBLIC_APP_URL||"https://servonas.com").replace(/\/$/,"")}/sites/${encodeURIComponent(publicSlug||"")}`;
 const serviceAreas=[...new Set((territories??[]).flatMap((area:any)=>[area.name,...(Array.isArray(area.strategy_config?.cities)?area.strategy_config.cities:[])]).filter(Boolean))] as string[];
 const reviews=(Array.isArray(website?.google_reviews)?website.google_reviews:[]).filter((review:any)=>review&&typeof review.text==="string").slice(0,6).map((review:any)=>({author:String(review.author||"Customer"),text:String(review.text),rating:Number(review.rating||5)}));
 const locationRows=await databaseOperation(telemetry,"load_location_activity","service_locations",false,supabase.from("service_locations").select("id").eq("business_id",businessId).eq("is_deleted",false).ilike("city",city));
 const locationIds=(locationRows.data??[]).map((row:any)=>row.id),since=new Date(Date.now()-90*24*60*60*1000).toISOString();
 const bookingRows=locationIds.length?await databaseOperation(telemetry,"load_recent_location_bookings","bookings",false,supabase.from("bookings").select("id").eq("business_id",businessId).in("service_location_id",locationIds).gte("created_at",since).in("status",["confirmed","paid"])):{data:[]};
 const source:LocationPageSource={business:{name:business.name,industry:business.industry_profile||business.industry_other||null,description:website?.about_text||null,phone:business.phone||null,email:business.email||null,city:business.city||null,state:business.state||null},location:{name:[city,state].filter(Boolean).join(", "),city,state,jobCount90d:(bookingRows.data??[]).length,customerCount:locationIds.length,reviewCount:reviews.filter((review:any)=>review.text.toLowerCase().includes(city.toLowerCase())).length},website:{baseUrl,heroHeading:website?.hero_heading||null,heroSubheading:website?.hero_subheading||null,aboutText:website?.about_text||null,bookingEnabled:Boolean(booking?.enabled||website?.booking_enabled),requestEnabled:website?.request_service_enabled!==false},serviceAreas,services:(services??[]).map((row:any)=>({name:row.name,description:row.description||null})),inventory:(inventory??[]).map((row:any)=>({name:row.name,description:row.description||null,category:row.category||null})),hours:(hours??[]).map((row:any)=>({weekday:Number(row.weekday),startTime:row.start_time,endTime:row.end_time})),reviews,policies:[booking?.standard_rental_hours?`${booking.standard_rental_hours}-hour standard rental period`:"",booking?.allow_multi_day_rentals?"Multi-day rentals available":""].filter(Boolean)};
 return source;
}

function schemaFor(source:LocationPageSource,page:{slug:string;pageTitle:string;metaDescription:string;h1:string;faqs:Array<{question:string;answer:string}>}){
 const url=`${source.website.baseUrl}/${page.slug}`;
 return{"@context":"https://schema.org","@graph":[{"@type":"LocalBusiness",name:source.business.name,url,telephone:source.business.phone||undefined,email:source.business.email||undefined,areaServed:{"@type":"City",name:source.location.name}},{"@type":"BreadcrumbList",itemListElement:[{"@type":"ListItem",position:1,name:source.business.name,item:source.website.baseUrl},{"@type":"ListItem",position:2,name:page.h1,item:url}]},{"@type":"FAQPage",mainEntity:page.faqs.map(faq=>({"@type":"Question",name:faq.question,acceptedAnswer:{"@type":"Answer",text:faq.answer}}))}]};
}

export async function buildLocationPage(slug:string,sourceLocationKey:string,dedupeKey:string){
 const {supabase,business,user,role}=await requireWorkspace(slug);
 if(!canManageBusiness(role))redirect(destination(slug,"error","Only owners and administrators can build location pages."));
 const telemetry:SeoTelemetry={actionName:"build_location_page",businessSlug:slug,operationId:`local-seo-${randomUUID()}`};
 console.info("local_seo_action_started",{...telemetry,businessId:business.id});
 const existingResult=await databaseOperation(telemetry,"preflight_location_page_storage","business_location_pages",true,supabase.from("business_location_pages").select("id").eq("business_id",business.id).eq("source_location_key",sourceLocationKey).maybeSingle());
 if(existingResult.error){console.error("local_seo_action_failed",{...telemetry,businessId:business.id,stage:"storage_preflight",fatal:true,...safeDatabaseError(existingResult.error)});redirect(destination(slug,"error","We couldn't build this page yet. Please try again."));}
 const existing=existingResult.data;
 if(existing?.id)redirect(editorPath(slug,existing.id));
 let createdId:string|null=null,errorMessage:string|null=null;
 try{
  const source=await locationPageSource(supabase,business.id,sourceLocationKey,telemetry);
  const existingPagesResult=await databaseOperation(telemetry,"load_existing_location_pages","business_location_pages",true,supabase.from("business_location_pages").select("city,h1,hero_copy,sections,faqs").eq("business_id",business.id).neq("status","archived"));
  if(existingPagesResult.error)throw new Error("location_page_storage_unavailable");
  const generated=await generateLocationPage({source,existingPages:existingPagesResult.data??[],telemetry}),now=new Date().toISOString();
  const createStartedAt=Date.now();
  console.info("local_seo_downstream_started",{...telemetry,operationName:"persist_location_page_draft",endpoint:"/rest/v1/business_location_pages",method:"POST",fatal:true});
  const {data:created,error,status}=await supabase.from("business_location_pages").insert({business_id:business.id,source_location_key:sourceLocationKey,city:source.location.city,state:source.location.state,slug:generated.page.slug,status:"draft",page_title:generated.page.pageTitle,meta_description:generated.page.metaDescription,og_title:generated.page.ogTitle,og_description:generated.page.ogDescription,h1:generated.page.h1,hero_copy:generated.page.heroCopy,cta_label:generated.page.ctaLabel,sections:generated.page.sections,faqs:generated.page.faqs,schema_json:schemaFor(source,generated.page),source_snapshot:source,source_version:locationSourceVersion(source),similarity_score:generated.similarityScore,generated_at:now,created_by:user.id,updated_by:user.id}).select("id").single();
  if(error||!created){console.error("local_seo_downstream_failed",{...telemetry,operationName:"persist_location_page_draft",endpoint:"/rest/v1/business_location_pages",method:"POST",httpStatus:status??databaseHttpStatus({error}),durationMs:Date.now()-createStartedAt,fatal:true,...safeDatabaseError(error)});throw new Error(error?.code==="23505"?"duplicate_location_page":"location_page_persistence_failed");}
  console.info("local_seo_downstream_completed",{...telemetry,operationName:"persist_location_page_draft",endpoint:"/rest/v1/business_location_pages",method:"POST",httpStatus:status??201,durationMs:Date.now()-createStartedAt,fatal:true,contentPersisted:true});
  createdId=created.id;
  const [mappingResult,stateResult]=await Promise.all([
   databaseOperation(telemetry,"persist_location_page_mapping","business_seo_entity_mappings",false,supabase.from("business_seo_entity_mappings").upsert({business_id:business.id,source_entity_type:"location",source_entity_id:sourceLocationKey,target_type:"website_location_page",target_id:created.id,status:"draft",metadata:{slug:generated.page.slug,city:source.location.city,state:source.location.state},updated_at:now,updated_by:user.id},{onConflict:"business_id,source_entity_type,source_entity_id,target_type"}),"POST"),
   databaseOperation(telemetry,"persist_recommendation_state","business_local_seo_recommendation_states",false,supabase.from("business_local_seo_recommendation_states").upsert({business_id:business.id,dedupe_key:dedupeKey,status:"open",completed_at:null,updated_at:now,updated_by:user.id},{onConflict:"business_id,dedupe_key"}),"POST"),
  ]);
  console.info("local_seo_action_completed",{...telemetry,businessId:business.id,createdPageId:created.id,mappingPersisted:!mappingResult.error,recommendationStatePersisted:!stateResult.error});
 }catch(error){
  if(isNextRedirect(error))throw error;
  console.error("local_seo_action_failed",{...telemetry,businessId:business.id,stage:createdId?"post_persistence":"generation_or_persistence",fatal:true,errorName:error instanceof Error?error.name:"unknown",sanitizedError:sanitizeLogMessage(error instanceof Error?error.message:null)});
  errorMessage=error instanceof Error&&error.message==="duplicate_location_page"?"A location page already exists for this city or URL.":"We couldn't build this page yet. Please try again.";
 }
 if(errorMessage)redirect(destination(slug,"error",errorMessage));
 revalidatePath(pagePath(slug));
 redirect(editorPath(slug,createdId!));
}

export async function saveLocationPage(slug:string,pageId:string,formData:FormData){
 const {supabase,business,user,role}=await requireWorkspace(slug);if(!canManageBusiness(role))redirect(destination(slug,"error","Only owners and administrators can edit location pages."));
 const sections=JSON.parse(text(formData.get("sections"),20000)||"[]"),faqs=JSON.parse(text(formData.get("faqs"),20000)||"[]");
 const {error}=await supabase.from("business_location_pages").update({page_title:text(formData.get("pageTitle"),65),meta_description:text(formData.get("metaDescription"),160),og_title:text(formData.get("ogTitle"),80),og_description:text(formData.get("ogDescription"),200),h1:text(formData.get("h1"),120),hero_copy:text(formData.get("heroCopy"),500),cta_label:text(formData.get("ctaLabel"),40),slug:text(formData.get("pageSlug"),80).toLowerCase().replace(/[^a-z0-9-]/g,"-"),sections,faqs,updated_at:new Date().toISOString(),updated_by:user.id}).eq("id",pageId).eq("business_id",business.id);
 if(error)redirect(`${editorPath(slug,pageId)}?error=${encodeURIComponent(error.code==="23505"?"That page URL is already in use.":"The page could not be saved.")}`);
 revalidatePath(editorPath(slug,pageId));redirect(`${editorPath(slug,pageId)}?success=${encodeURIComponent("Page saved.")}`);
}

export async function publishLocationPage(slug:string,pageId:string){
 const {supabase,business,user,role}=await requireWorkspace(slug);if(!canManageBusiness(role))redirect(destination(slug,"error","Only owners and administrators can publish location pages."));
 const now=new Date().toISOString(),{data:page,error}=await supabase.from("business_location_pages").update({status:"published",published_at:now,updated_at:now,updated_by:user.id}).eq("id",pageId).eq("business_id",business.id).select("source_location_key,slug").maybeSingle();
 if(error||!page)redirect(`${editorPath(slug,pageId)}?error=${encodeURIComponent("The page could not be published.")}`);
 const dedupeKey=`local-seo:location-page:${page.source_location_key}`;
 await Promise.all([supabase.from("business_seo_entity_mappings").update({status:"published",metadata:{slug:page.slug,publishedAt:now},updated_at:now,updated_by:user.id}).eq("business_id",business.id).eq("source_entity_type","location").eq("source_entity_id",page.source_location_key).eq("target_type","website_location_page"),supabase.from("business_local_seo_recommendation_states").upsert({business_id:business.id,dedupe_key:dedupeKey,status:"completed",completed_at:now,updated_at:now,updated_by:user.id},{onConflict:"business_id,dedupe_key"})]);
 revalidatePath(pagePath(slug));revalidatePath(`/sites/[siteSlug]/${page.slug}`);revalidatePath(`/sites/domain/[domain]/${page.slug}`);redirect(`${editorPath(slug,pageId)}?success=${encodeURIComponent("Location page published.")}`);
}

export async function regenerateLocationPage(slug:string,pageId:string){
 const {supabase,business,user,role}=await requireWorkspace(slug);if(!canManageBusiness(role))redirect(destination(slug,"error","Only owners and administrators can regenerate location pages."));
 const telemetry:SeoTelemetry={actionName:"regenerate_location_page",businessSlug:slug,operationId:`local-seo-${randomUUID()}`};
 let errorMessage:string|null=null;
 try{const {data:current}=await supabase.from("business_location_pages").select("source_location_key").eq("id",pageId).eq("business_id",business.id).single();if(!current)throw new Error("Location page not found.");const source=await locationPageSource(supabase,business.id,current.source_location_key,telemetry),{data:others}=await supabase.from("business_location_pages").select("city,h1,hero_copy,sections,faqs").eq("business_id",business.id).neq("id",pageId).neq("status","archived"),generated=await generateLocationPage({source,existingPages:others??[],telemetry});const {error}=await supabase.from("business_location_pages").update({slug:generated.page.slug,page_title:generated.page.pageTitle,meta_description:generated.page.metaDescription,og_title:generated.page.ogTitle,og_description:generated.page.ogDescription,h1:generated.page.h1,hero_copy:generated.page.heroCopy,cta_label:generated.page.ctaLabel,sections:generated.page.sections,faqs:generated.page.faqs,schema_json:schemaFor(source,generated.page),source_snapshot:source,source_version:locationSourceVersion(source),similarity_score:generated.similarityScore,generated_at:new Date().toISOString(),updated_at:new Date().toISOString(),updated_by:user.id}).eq("id",pageId).eq("business_id",business.id);if(error)throw new Error("The regenerated page could not be saved.");}catch(error){if(isNextRedirect(error))throw error;errorMessage=error instanceof Error?error.message:"Page regeneration failed.";}
 if(errorMessage)redirect(`${editorPath(slug,pageId)}?error=${encodeURIComponent(errorMessage)}`);revalidatePath(editorPath(slug,pageId));redirect(`${editorPath(slug,pageId)}?success=${encodeURIComponent("A fresh page draft is ready.")}`);
}

export async function updateLocalSeoRecommendationState(slug: string, dedupeKey: string, status: "dismissed" | "completed" | "open") {
  const { supabase, business, user, role } = await requireWorkspace(slug);
  if (!canManageBusiness(role)) redirect(destination(slug, "error", "Only owners and administrators can update Local SEO recommendations."));
  const now = new Date().toISOString();
  const row = {
    business_id: business.id,
    dedupe_key: dedupeKey,
    status,
    dismissed_at: status === "dismissed" ? now : null,
    completed_at: status === "completed" ? now : null,
    updated_at: now,
    updated_by: user.id,
  };
  const { error } = await supabase.from("business_local_seo_recommendation_states").upsert(row, { onConflict: "business_id,dedupe_key" });
  if (error) redirect(destination(slug, "error", "Local SEO recommendation storage is not installed yet."));
  revalidatePath(pagePath(slug));
  redirect(destination(slug, "success", status === "dismissed" ? "Recommendation dismissed." : status === "completed" ? "Recommendation marked complete." : "Recommendation reopened."));
}

export async function saveLocalSeoDraft(
  slug: string,
  input: { sourceEntityType: "service" | "inventory_item" | "location"; sourceEntityId: string; targetType: "website_service_page" | "website_location_page"; dedupeKey: string; draft: string },
) {
  const { supabase, business, user, role } = await requireWorkspace(slug);
  if (!canManageBusiness(role)) redirect(destination(slug, "error", "Only owners and administrators can create Local SEO drafts."));
  const draft = JSON.parse(input.draft) as Record<string, unknown>;
  const now = new Date().toISOString();
  const { error: mappingError } = await supabase.from("business_seo_entity_mappings").upsert({
    business_id: business.id,
    source_entity_type: input.sourceEntityType,
    source_entity_id: input.sourceEntityId,
    target_type: input.targetType,
    target_id: typeof draft.slug === "string" ? draft.slug : null,
    status: "draft",
    metadata: draft,
    updated_at: now,
    updated_by: user.id,
  }, { onConflict: "business_id,source_entity_type,source_entity_id,target_type" });
  if (mappingError) redirect(destination(slug, "error", "Local SEO draft storage is not installed yet."));
  const { error: stateError } = await supabase.from("business_local_seo_recommendation_states").upsert({
    business_id: business.id,
    dedupe_key: input.dedupeKey,
    status: "completed",
    completed_at: now,
    updated_at: now,
    updated_by: user.id,
  }, { onConflict: "business_id,dedupe_key" });
  if (stateError) redirect(destination(slug, "error", "Local SEO recommendation state could not be updated."));
  revalidatePath(pagePath(slug));
  redirect(destination(slug, "success", "SEO page draft saved. Servonas stored the brief and metadata for future website publishing."));
}
