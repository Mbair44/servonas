"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageBusiness} from "@/lib/access";
import {requireWorkspaceCapability} from "@/lib/workspace";
import {normalizeWebsiteDomain,validWebsiteColor,validWebsiteSlug,websiteTemplates} from "@/lib/website";
import {addVercelProjectDomain,buyVercelDomain,domainRetailPrice,getVercelDomainOrder,getVercelDomainQuote,getVercelDomainStatus,vercelDomainErrorDetails,vercelStandardDomainMaximumPrice,verifyVercelProjectDomain,type VercelRegistrant} from "@/lib/vercelDomains";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {findGoogleBusinessPlace,resolveGoogleBusinessPlaceId} from "@/lib/googleBusinessPlace";
import {normalizeInstagramUrl} from "@/lib/socialLinks";
import {resolveGoogleAddress} from "@/lib/googleAddress";
import {sendDomainPurchaseNotification} from "@/lib/communications/domainPurchaseEmailService";
import {linkAcquisitionSession} from "@/lib/acquisitionFunnel";
import {buildWebsiteAiImagePrompt,estimateWebsiteAiImageCost,normalizeWebsiteAiImageQuality,normalizeWebsiteAiImageSize,websiteAiImageFeature,websiteAiImageLimit,type WebsiteAiImageGenerationKind,type WebsiteAiImageType} from "@/lib/websiteAiImages";
import {buildImageVariantPaths,imageVariantCacheControl,managedImageVariantPathsFromPublicUrl} from "@/lib/storageImageVariants";

const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const target=(slug:string,kind:"success"|"error",message:string,step?:string,extra?:Record<string,string>)=>{
 const query=new URLSearchParams();
 query.set(kind,message);
 if(step)query.set("step",step);
 if(extra)for(const [key,value] of Object.entries(extra))if(value)query.set(key,value);
 return `/app/${slug}/settings/website?${query.toString()}`;
};
const websiteFirstTarget=(slug:string,mode:"preview"|"domain"|"live",kind?:"success"|"error",message?:string,extra?:Record<string,string>)=>{
 const query=new URLSearchParams({business:slug,websiteStep:"preview",websiteMode:mode});
 if(kind&&message)query.set(kind,message);
 if(extra)for(const [key,value] of Object.entries(extra))if(value)query.set(key,value);
 return `/onboarding?${query.toString()}`;
};
const legacyManagedDomainExtra=(stage:"search"|"details"|"registered",suggestions:string[]=[]):Record<string,string>=>({
 domainMode:"managed",
 domainStage:stage,
 domainSuggestions:suggestions.join(","),
});

function domainSuggestionCandidates(input:{domain:string;businessName?:string|null;businessSlug?:string|null;city?:string|null;state?:string|null}){
 const parsed=normalizeWebsiteDomain(input.domain);
 if(!parsed)return [];
 const [host,...rest]=parsed.split(".");
 const extension=rest.length?`.${rest.join(".")}`:".com";
 const sanitize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").replace(/-{2,}/g,"-");
 const squeeze=(value:string)=>sanitize(value).replace(/-/g,"");
 const stateAbbreviation=(value:string)=>{
  const normalized=value.trim().toLowerCase();
  const known:Record<string,string>={alabama:"al",alaska:"ak",arizona:"az",arkansas:"ar",california:"ca",colorado:"co",connecticut:"ct",delaware:"de",florida:"fl",georgia:"ga",hawaii:"hi",idaho:"id",illinois:"il",indiana:"in",iowa:"ia",kansas:"ks",kentucky:"ky",louisiana:"la",maine:"me",maryland:"md",massachusetts:"ma",michigan:"mi",minnesota:"mn",mississippi:"ms",missouri:"mo",montana:"mt",nebraska:"ne",nevada:"nv",newhampshire:"nh",newjersey:"nj",newmexico:"nm",newyork:"ny",northcarolina:"nc",northdakota:"nd",ohio:"oh",oklahoma:"ok",oregon:"or",pennsylvania:"pa",rhodeisland:"ri",southcarolina:"sc",southdakota:"sd",tennessee:"tn",texas:"tx",utah:"ut",vermont:"vt",virginia:"va",washington:"wa",westvirginia:"wv",wisconsin:"wi",wyoming:"wy",districtofcolumbia:"dc"};
  const compact=normalized.replace(/[^a-z]/g,"");
  if(/^[a-z]{2}$/.test(compact))return compact;
  return known[compact]??"";
 };
 const base=sanitize(host);
 const rawSeeds=[
  base,
  squeeze(base),
  input.businessName?sanitize(input.businessName):"",
  input.businessName?squeeze(input.businessName):"",
  input.businessSlug?sanitize(input.businessSlug):"",
 ].filter(Boolean);
 const stems=[...new Set(rawSeeds)].filter(value=>value.length>=3).slice(0,3);
 const city=input.city?sanitize(input.city):"";
 const state=input.state?stateAbbreviation(input.state):"";
 const variants=new Set<string>();
 for(const stem of stems){
  variants.add(`${stem}${extension}`);
  if(city){
   variants.add(`${stem}-${city}${extension}`);
   variants.add(`${city}-${stem}${extension}`);
  }
  if(state){
   variants.add(`${stem}-${state}${extension}`);
   variants.add(`${state}-${stem}${extension}`);
  }
  if(city&&state){
   variants.add(`${stem}-${city}-${state}${extension}`);
   variants.add(`${city}-${stem}-${state}${extension}`);
  }
  for(const suffix of ["az","co","hq","now","today","online","service","services","book","get","go"]){
   variants.add(`${stem}-${suffix}${extension}`);
   variants.add(`${suffix}-${stem}${extension}`);
  }
 }
 variants.delete(parsed);
 return [...variants].filter(candidate=>candidate.length<=63).slice(0,18);
}

async function findAvailableManagedDomainSuggestions(input:{domain:string;businessName?:string|null;businessSlug?:string|null;city?:string|null;state?:string|null}){
 const candidates=domainSuggestionCandidates(input);
 const matches:string[]=[];
 for(const candidate of candidates){
  try{
   const quote=await getVercelDomainQuote(candidate);
   if(quote.available&&quote.purchasePrice<=standardDomainLimit())matches.push(candidate);
  }catch{
   continue;
  }
  if(matches.length>=3)break;
 }
 return matches;
}
const urls=(value:string)=>[...new Set(value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean))].slice(0,24);
const reviews=(data:FormData)=>{
 const authors=data.getAll("reviewAuthor").map(String),ratings=data.getAll("reviewRating").map(Number),texts=data.getAll("reviewText").map(value=>String(value).trim());
 return authors.map((author,index)=>({author:author.trim(),rating:ratings[index],text:texts[index]??""})).filter(review=>review.author||review.text).slice(0,6);
};

async function notifyAcceptedDomainPurchase(admin:NonNullable<ReturnType<typeof getSupabaseAdmin>>,orderId:string,business:{id:string;name:string;slug:string;email?:string|null}){
 const {data:order}=await admin.from("website_domain_orders").select("id,domain_name,provider_order_id,purchase_price,customer_renewal_price,currency,purchase_notification_status,purchase_notification_attempts,purchase_notification_last_attempt_at").eq("id",orderId).maybeSingle();
 if(!order?.provider_order_id||order.purchase_notification_status==="sent"||order.purchase_notification_status==="sending")return;
 if(order.purchase_notification_status==="failed"&&order.purchase_notification_last_attempt_at&&Date.now()-new Date(order.purchase_notification_last_attempt_at).getTime()<300000)return;
 const attemptAt=new Date().toISOString(),{data:claimed}=await admin.from("website_domain_orders").update({purchase_notification_status:"sending",purchase_notification_attempts:Number(order.purchase_notification_attempts??0)+1,purchase_notification_last_attempt_at:attemptAt,purchase_notification_error:null,updated_at:attemptAt}).eq("id",order.id).in("purchase_notification_status",["pending","failed"]).select("id").maybeSingle();
 if(!claimed)return;
 const delivery=await sendDomainPurchaseNotification({businessId:business.id,businessName:business.name,businessSlug:business.slug,businessEmail:business.email,domain:order.domain_name,providerOrderId:order.provider_order_id,providerCost:Number(order.purchase_price??0),customerRenewalPrice:order.customer_renewal_price==null?null:Number(order.customer_renewal_price),currency:order.currency??"USD"});
 await admin.from("website_domain_orders").update(delivery.ok?{purchase_notification_status:"sent",purchase_notification_sent_at:new Date().toISOString(),purchase_notification_provider_id:delivery.messageId,purchase_notification_error:null,updated_at:new Date().toISOString()}:{purchase_notification_status:"failed",purchase_notification_error:delivery.error,updated_at:new Date().toISOString()}).eq("id",order.id).eq("purchase_notification_status","sending");
}
const standardDomainLimit=vercelStandardDomainMaximumPrice;
const websiteAiImageModel=process.env.OPENAI_WEBSITE_IMAGE_MODEL?.trim()||"gpt-image-1";

type WebsiteAiEventName="website_ai_image_opened"|"website_ai_image_generation_started"|"website_ai_image_generation_completed"|"website_ai_image_generation_failed"|"website_ai_image_saved"|"website_ai_image_regenerated"|"website_ai_image_discarded"|"website_ai_image_limit_reached";

async function recordWebsiteAiImageEvent(input:{businessId:string;userId:string;generationId?:string|null;eventName:WebsiteAiEventName;metadata:Record<string,unknown>}){
 const admin=getSupabaseAdmin();
 if(!admin)return;
 const {error}=await admin.from("website_ai_image_events").insert({business_id:input.businessId,user_id:input.userId,generation_id:input.generationId??null,event_name:input.eventName,metadata:input.metadata});
 if(error)console.error("Website AI image analytics could not be recorded",{businessId:input.businessId,eventName:input.eventName,code:error.code});
}

async function websiteAiGenerationUsageCount(businessId:string){
 const admin=getSupabaseAdmin();
 if(!admin)return 0;
 const {count,error}=await admin.from("website_ai_image_generations").select("id",{count:"exact",head:true}).eq("business_id",businessId).in("status",["generated","saved","discarded","replaced"]);
 if(error){console.error("Website AI image usage count failed",{businessId,code:error.code});return 0;}
 return count??0;
}

async function currentWebsiteId(businessId:string){
 const admin=getSupabaseAdmin();
 if(!admin)return null;
 const {data}=await admin.from("business_website_settings").select("id").eq("business_id",businessId).maybeSingle();
 return data?.id??null;
}

async function websiteAiImagePricing(model:string,size:string,quality:string,occurredAt:string){
 const admin=getSupabaseAdmin();
 if(!admin)return null;
 const pricingModels=[model,model.replace(/-\d+(?:\.\d+)?$/u,"")].filter((value,index,values)=>values.indexOf(value)===index);
 const {data}=await admin.from("ai_image_model_pricing")
  .select("id,usd_per_image,effective_from,effective_to,source_url")
  .eq("provider","openai").in("model",pricingModels).eq("image_size",size).eq("image_quality",quality)
  .lte("effective_from",occurredAt).or(`effective_to.is.null,effective_to.gt.${occurredAt}`)
  .order("effective_from",{ascending:false}).limit(1).maybeSingle();
 return data??null;
}

function safeWebsiteAiMessage(reason?:"missing_openai"|"missing_supabase"|"generation_failed"|"save_failed"|"discard_failed"){
 if(reason==="missing_openai")return "AI photo generation is not configured yet. Add the OpenAI API key and try again.";
 if(reason==="missing_supabase")return "AI photo generation is not configured yet. Add the Supabase service role key and try again.";
 if(reason==="save_failed")return "That AI photo could not be saved right now. Please try again.";
 if(reason==="discard_failed")return "That AI photo could not be discarded right now. Please try again.";
 return "We couldn't create that photo. Please try again.";
}

async function managedDomainContext(slug:string){
 const context=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(context.role))redirect(target(slug,"error","Only owners and administrators can register the business domain.","domain"));
 const admin=getSupabaseAdmin();if(!admin)redirect(target(slug,"error","Domain registration is temporarily unavailable.","domain"));
 const {data:state}=await admin.from("business_website_onboarding_states").select("domain_preference,requested_domain").eq("business_id",context.business.id).maybeSingle();
 const domain=normalizeWebsiteDomain(state?.requested_domain??"");
 if(state?.domain_preference!=="need_domain"||!domain)redirect(target(slug,"error","Choose a Servonas-managed domain before continuing.","domain"));
 return {...context,admin,domain};
}

async function managedDomainContextForLegacy(slug:string){
 const context=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(context.role))redirect(target(slug,"error","Only owners and administrators can register the business domain.","domain"));
 const admin=getSupabaseAdmin();if(!admin)redirect(target(slug,"error","Domain registration is temporarily unavailable.","domain"));
 const {data:state}=await admin.from("business_website_onboarding_states").select("domain_preference,requested_domain").eq("business_id",context.business.id).maybeSingle();
 const domain=normalizeWebsiteDomain(state?.requested_domain??"");
 if(state?.domain_preference!=="need_domain"||!domain)redirect(target(slug,"error","Choose a Servonas-managed domain before continuing.","domain",legacyManagedDomainExtra("search")));
 return {...context,admin,domain};
}

async function completeWebsiteFirstLaunchState(slug:string,businessId:string,supabase:any){
 const now=new Date().toISOString();
 const {error}=await supabase.from("business_website_onboarding_states").update({current_step:"completed",completed_at:now,updated_at:now}).eq("business_id",businessId);
 if(error)console.error("Website-first launch completion failed",{businessId,code:error.code});
 revalidatePath("/onboarding");
 revalidatePath(`/onboarding?business=${slug}`);
}

function returnToWebsiteFirst(slug:string,data?:FormData){
 return data?.get("returnFlow")==="website_first";
}

async function checkManagedDomainAvailabilityForWebsiteFirst(slug:string,input:{admin:NonNullable<ReturnType<typeof getSupabaseAdmin>>;user:{id:string};business:{id:string};domain:string;}){
 const {admin,user,business,domain}=input;
 const {data:existing}=await admin.from("website_domain_orders").select("status,provider_order_id").eq("business_id",business.id).eq("domain_name",domain).maybeSingle();
 if(existing?.provider_order_id||["registration_pending","registered","connected"].includes(existing?.status??""))redirect(websiteFirstTarget(slug,"preview","error","Registration already started. Servonas is checking its status automatically.",{domainChoice:"need_domain",domainStage:"registered"}));
 let quote:Awaited<ReturnType<typeof getVercelDomainQuote>>;try{quote=await getVercelDomainQuote(domain);}catch(error){console.error("Customer domain quote failed",{businessId:business.id,category:error instanceof TypeError?"network":"provider"});redirect(websiteFirstTarget(slug,"preview","error","We could not check this domain right now. Try again shortly.",{domainChoice:"need_domain",domainStage:"search"}));}
 const status=!quote.available?"unavailable":quote.purchasePrice<=standardDomainLimit()?"available":"premium_review",now=new Date().toISOString();
 const {error}=await admin.from("website_domain_orders").upsert({business_id:business.id,domain_name:domain,status,purchase_price:quote.purchasePrice,renewal_price:quote.renewalPrice,customer_purchase_price:domainRetailPrice(quote.purchasePrice),customer_renewal_price:domainRetailPrice(quote.renewalPrice),retail_markup_bps:7500,currency:"USD",registration_years:quote.years,availability_checked_at:now,updated_at:now,updated_by:user.id,created_by:user.id},{onConflict:"business_id,domain_name"});
 if(error)redirect(websiteFirstTarget(slug,"preview","error","The availability result could not be saved. Apply the Vercel domain registration migration.",{domainChoice:"need_domain",domainStage:"search"}));
 await admin.from("business_website_onboarding_states").update({domain_request_status:status,updated_at:now,updated_by:user.id}).eq("business_id",business.id).eq("requested_domain",domain);
 revalidatePath("/onboarding");
 revalidatePath(`/onboarding?business=${slug}`);
 revalidatePath(`/app/${slug}/settings/website`);
 const domainSuggestions=!quote.available||status==="premium_review"?await findAvailableManagedDomainSuggestions({domain,businessName:(business as {name?:string|null;city?:string|null;state?:string|null}).name,businessSlug:slug,city:(business as {city?:string|null}).city,state:(business as {state?:string|null}).state}):[];
 redirect(websiteFirstTarget(slug,"preview",quote.available&&!status.includes("premium")?"success":"error",quote.available?(status==="available"?`${domain} is available. Review the renewal price and registration details below.`:"That is a premium domain and is not included. Choose a standard domain instead."):"That domain is no longer available. Choose another domain in website setup.",{domainChoice:"need_domain",domainStage:status==="available"?"details":"search",domainSuggestions:domainSuggestions.join(",")}));
}

export async function checkManagedDomainAvailability(slug:string){
 const {admin,user,business,domain}=await managedDomainContext(slug);
 await checkManagedDomainAvailabilityForWebsiteFirst(slug,{admin,user,business,domain});
}

async function checkManagedDomainAvailabilityForLegacy(slug:string,input:{admin:NonNullable<ReturnType<typeof getSupabaseAdmin>>;user:{id:string};business:{id:string;name?:string|null;city?:string|null;state?:string|null};domain:string;}){
 const {admin,user,business,domain}=input;
 const {data:existing}=await admin.from("website_domain_orders").select("status,provider_order_id").eq("business_id",business.id).eq("domain_name",domain).maybeSingle();
 if(existing?.provider_order_id||["registration_pending","registered","connected"].includes(existing?.status??""))redirect(target(slug,"error","Registration already started. Servonas is checking its status automatically.","domain",legacyManagedDomainExtra("registered")));
 let quote:Awaited<ReturnType<typeof getVercelDomainQuote>>;
 try{quote=await getVercelDomainQuote(domain);}catch(error){console.error("Legacy customer domain quote failed",{businessId:business.id,category:error instanceof TypeError?"network":"provider"});redirect(target(slug,"error","We could not check this domain right now. Try again shortly.","domain",legacyManagedDomainExtra("search")));} 
 const status=!quote.available?"unavailable":quote.purchasePrice<=standardDomainLimit()?"available":"premium_review",now=new Date().toISOString();
 const {error}=await admin.from("website_domain_orders").upsert({business_id:business.id,domain_name:domain,status,purchase_price:quote.purchasePrice,renewal_price:quote.renewalPrice,customer_purchase_price:domainRetailPrice(quote.purchasePrice),customer_renewal_price:domainRetailPrice(quote.renewalPrice),retail_markup_bps:7500,currency:"USD",registration_years:quote.years,availability_checked_at:now,updated_at:now,updated_by:user.id,created_by:user.id},{onConflict:"business_id,domain_name"});
 if(error)redirect(target(slug,"error","The availability result could not be saved. Apply the Vercel domain registration migration.","domain",legacyManagedDomainExtra("search")));
 await admin.from("business_website_onboarding_states").update({domain_request_status:status,updated_at:now,updated_by:user.id}).eq("business_id",business.id).eq("requested_domain",domain);
 revalidatePath(`/app/${slug}/settings/website`);
 const domainSuggestions=!quote.available||status==="premium_review"?await findAvailableManagedDomainSuggestions({domain,businessName:business.name,businessSlug:slug,city:business.city,state:business.state}):[];
 redirect(target(slug,quote.available&&!status.includes("premium")?"success":"error",quote.available?(status==="available"?`${domain} is available. Review the renewal price and registration details below.`:"That is a premium domain and is not included. Choose a standard domain instead."):"That domain is no longer available. Choose another domain in website setup.","domain",legacyManagedDomainExtra(status==="available"?"details":"search",domainSuggestions)));
}

export async function saveLegacyManagedDomainChoice(slug:string,data:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))redirect("/app");
 const domainName=normalizeWebsiteDomain(text(data,"domainName"));
 if(!domainName)redirect(target(slug,"error","Enter a valid domain, such as yourbusiness.com.","domain",legacyManagedDomainExtra("search")));
 const now=new Date().toISOString();
 const {error}=await supabase.from("business_website_onboarding_states").upsert({business_id:business.id,source:"website_settings",current_step:"domain",domain_preference:"need_domain",domain_name:domainName,requested_domain:domainName,domain_request_status:"availability_check_needed",domain_requested_at:now,updated_at:now,updated_by:user.id,created_by:user.id},{onConflict:"business_id"});
 if(error)redirect(target(slug,"error","The domain choice could not be saved.","domain",legacyManagedDomainExtra("search")));
 const admin=getSupabaseAdmin();
 if(!admin)redirect(target(slug,"error","Domain registration is temporarily unavailable.","domain",legacyManagedDomainExtra("search")));
 await checkManagedDomainAvailabilityForLegacy(slug,{admin,user,business,domain:domainName});
}

export async function checkManagedDomainAvailabilityLegacy(slug:string){
 const {admin,user,business,domain}=await managedDomainContextForLegacy(slug);
 await checkManagedDomainAvailabilityForLegacy(slug,{admin,user,business,domain});
}

export async function changeManagedDomainRequestLegacy(slug:string,data:FormData){
 const {admin,user,business,domain}=await managedDomainContextForLegacy(slug),nextDomain=normalizeWebsiteDomain(text(data,"newManagedDomain"));
 if(!nextDomain)redirect(target(slug,"error","Enter a valid domain, such as yourbusiness.com.","domain",legacyManagedDomainExtra("search")));
 const {data:active}=await admin.from("website_domain_orders").select("status,provider_order_id").eq("business_id",business.id).eq("domain_name",domain).maybeSingle();
 if(active?.provider_order_id||["registration_pending","registered","connected"].includes(active?.status??""))redirect(target(slug,"error","The current domain registration already started and cannot be replaced.","domain",legacyManagedDomainExtra("registered")));
 const now=new Date().toISOString(),{error}=await admin.from("business_website_onboarding_states").update({requested_domain:nextDomain,domain_name:nextDomain,domain_request_status:"availability_check_needed",domain_requested_at:now,updated_at:now,updated_by:user.id}).eq("business_id",business.id).eq("requested_domain",domain);
 if(error)redirect(target(slug,"error","The requested domain could not be changed.","domain",legacyManagedDomainExtra("search")));
 revalidatePath(`/app/${slug}/settings/website`);
 redirect(target(slug,"success",`Now checking ${nextDomain}. Confirm availability below.`,"domain",legacyManagedDomainExtra("search")));
}

export async function purchaseManagedDomainLegacy(slug:string,data:FormData){
 const {admin,user,business,domain}=await managedDomainContextForLegacy(slug);
 if(data.get("registrationTerms")!=="on"||data.get("renewalTerms")!=="on")redirect(target(slug,"error","Accept both confirmations before registering this domain.","domain",legacyManagedDomainExtra("details")));
 const {data:order}=await admin.from("website_domain_orders").select("id,status,provider_order_id,purchase_price,purchase_confirmed_at").eq("business_id",business.id).eq("domain_name",domain).maybeSingle();
 if(!order)redirect(target(slug,"error","Check availability before registering this domain.","domain",legacyManagedDomainExtra("details")));
 if(order.provider_order_id||["registration_pending","registered","connected"].includes(order.status))redirect(target(slug,"error","This domain already has a protected registration attempt. It was not purchased again.","domain",legacyManagedDomainExtra("registered")));
 const country=text(data,"country").toUpperCase(),rawPhone=text(data,"phone"),digits=rawPhone.replace(/\D/g,""),phone=country==="US"?(digits.length===10?`+1${digits}`:digits.length===11&&digits.startsWith("1")?`+${digits}`:rawPhone.startsWith("+")?`+${digits}`:rawPhone):rawPhone.startsWith("+")?`+${digits}`:rawPhone;
 const registrant={firstName:text(data,"firstName"),lastName:text(data,"lastName"),companyName:text(data,"companyName")||business.name,email:text(data,"email"),phone,address1:text(data,"address1"),address2:text(data,"address2")||undefined,city:text(data,"city"),state:text(data,"state"),zip:text(data,"zip"),country};
 if(!registrant.firstName||!registrant.lastName||!/^\S+@\S+\.\S+$/.test(registrant.email)||!/^\+[1-9]\d{7,14}$/.test(phone)||!registrant.address1||!registrant.city||!registrant.state||!registrant.zip||!/^[A-Z]{2}$/.test(country))redirect(target(slug,"error","Complete the registrant contact information. Phone formatting is handled automatically.","domain",legacyManagedDomainExtra("details")));
 if(process.env.GOOGLE_MAPS_API_KEY){
  const verified=await resolveGoogleAddress({line1:registrant.address1,line2:registrant.address2,city:registrant.city,region:registrant.state,postalCode:registrant.zip,countryCode:registrant.country});
  if(verified.status!=="verified"||!verified.normalizedAddress)redirect(target(slug,"error","Google could not verify the registrant address. Choose a suggestion or confirm every address field.","domain",legacyManagedDomainExtra("details")));
  registrant.address1=verified.normalizedAddress.line1??registrant.address1;
  registrant.address2=registrant.address2??verified.normalizedAddress.line2??undefined;
  registrant.city=verified.normalizedAddress.city??registrant.city;
  registrant.state=verified.normalizedAddress.region??registrant.state;
  registrant.zip=verified.normalizedAddress.postalCode??registrant.zip;
  registrant.country=verified.normalizedAddress.countryCode??registrant.country;
 }
 let quote:Awaited<ReturnType<typeof getVercelDomainQuote>>;
 try{quote=await getVercelDomainQuote(domain);}catch{redirect(target(slug,"error","The current price could not be confirmed, so nothing was registered.","domain",legacyManagedDomainExtra("details")));}
 if(!quote.available)redirect(target(slug,"error","The domain is no longer available and was not registered.","domain",legacyManagedDomainExtra("search")));
 if(quote.purchasePrice>standardDomainLimit())redirect(target(slug,"error","This is now a premium domain and is not included. Nothing was registered.","domain",legacyManagedDomainExtra("search")));
 if(Number(order.purchase_price)!==quote.purchasePrice)redirect(target(slug,"error","The domain price changed. Check availability again before registering.","domain",legacyManagedDomainExtra("search")));
 const claimed=await admin.from("website_domain_orders").update({status:"registration_pending",purchase_confirmed_at:new Date().toISOString(),updated_at:new Date().toISOString(),updated_by:user.id,registrant_contact:{...registrant,phone}}).eq("id",order.id).is("provider_order_id",null).in("status",["available","failed","premium_review","unavailable"]).select("id").maybeSingle();
 if(!claimed.data)redirect(target(slug,"error","Another registration attempt already started. Servonas will check its status automatically.","domain",legacyManagedDomainExtra("registered")));
 try{
  const purchased=await buyVercelDomain(domain,quote.purchasePrice,{firstName:registrant.firstName,lastName:registrant.lastName,email:registrant.email,phone,address1:registrant.address1,address2:registrant.address2,city:registrant.city,state:registrant.state,zip:registrant.zip,country:registrant.country,companyName:registrant.companyName} satisfies VercelRegistrant);
  await admin.from("website_domain_orders").update({status:"registered",provider_order_id:purchased.orderId,updated_at:new Date().toISOString(),updated_by:user.id,last_error_category:null}).eq("id",order.id);
  await admin.from("business_website_onboarding_states").update({domain_request_status:"registered",updated_at:new Date().toISOString(),updated_by:user.id}).eq("business_id",business.id);
  await notifyAcceptedDomainPurchase(admin,order.id,business);
 }catch(error){
  const details=vercelDomainErrorDetails(error);
  console.error("Legacy customer domain registration failed",{businessId:business.id,category:details.category,uncertain:details.uncertain});
  await admin.from("website_domain_orders").update({status:details.uncertain?"registration_pending":"failed",last_error_category:details.category,updated_at:new Date().toISOString(),updated_by:user.id}).eq("id",order.id).is("provider_order_id",null);
  redirect(target(slug,"error",`${details.message} Nothing was retried automatically.`,"domain",legacyManagedDomainExtra("details")));
 }
 revalidatePath(`/app/${slug}/settings/website`);
 redirect(target(slug,"success",`${domain} is registered. We’re connecting it to your website now.`,"domain",legacyManagedDomainExtra("registered")));
}

export async function changeManagedDomainRequest(slug:string,data:FormData){
 const {admin,user,business,domain}=await managedDomainContext(slug),nextDomain=normalizeWebsiteDomain(text(data,"newManagedDomain"));
 if(!nextDomain)redirect(websiteFirstTarget(slug,"preview","error","Enter a valid domain, such as yourbusiness.com.",{domainChoice:"need_domain",domainStage:"search"}));
 const {data:active}=await admin.from("website_domain_orders").select("status,provider_order_id").eq("business_id",business.id).eq("domain_name",domain).maybeSingle();
 if(active?.provider_order_id||["registration_pending","registered","connected"].includes(active?.status??""))redirect(websiteFirstTarget(slug,"preview","error","The current domain registration already started and cannot be replaced.",{domainChoice:"need_domain",domainStage:"registered"}));
 const now=new Date().toISOString(),{error}=await admin.from("business_website_onboarding_states").update({requested_domain:nextDomain,domain_name:nextDomain,domain_request_status:"availability_check_needed",domain_requested_at:now,updated_at:now,updated_by:user.id}).eq("business_id",business.id).eq("requested_domain",domain);
 if(error)redirect(websiteFirstTarget(slug,"preview","error","The requested domain could not be changed.",{domainChoice:"need_domain",domainStage:"search"}));
 revalidatePath("/onboarding");
 revalidatePath(`/onboarding?business=${slug}`);
 revalidatePath(`/app/${slug}/settings/website`);
 redirect(websiteFirstTarget(slug,"preview","success",`Now checking ${nextDomain}. Confirm availability below.`,{domainChoice:"need_domain",domainStage:"search"}));
}

export async function saveWebsiteFirstManagedDomainChoice(slug:string,data:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))redirect("/app");
 const domainName=normalizeWebsiteDomain(text(data,"domainName"));
 if(!domainName)redirect(websiteFirstTarget(slug,"preview","error","Enter a valid domain, such as yourbusiness.com.",{domainChoice:"need_domain",domainStage:"search"}));
 const now=new Date().toISOString();
 const {error}=await supabase.from("business_website_onboarding_states").update({domain_preference:"need_domain",domain_name:domainName,requested_domain:domainName,domain_request_status:"availability_check_needed",domain_requested_at:now,updated_at:now,updated_by:user.id}).eq("business_id",business.id);
 if(error)redirect(websiteFirstTarget(slug,"preview","error","The domain choice could not be saved.",{domainChoice:"need_domain",domainStage:"search"}));
 const admin=getSupabaseAdmin();
 if(!admin)redirect(websiteFirstTarget(slug,"preview","error","Domain registration is temporarily unavailable.",{domainChoice:"need_domain",domainStage:"search"}));
 await checkManagedDomainAvailabilityForWebsiteFirst(slug,{admin,user,business,domain:domainName});
}

export async function purchaseManagedDomain(slug:string,data:FormData){
 const {admin,user,business,domain}=await managedDomainContext(slug);
 if(data.get("registrationTerms")!=="on"||data.get("renewalTerms")!=="on")redirect(websiteFirstTarget(slug,"preview","error","Accept both confirmations before registering this domain.",{domainChoice:"need_domain",domainStage:"details"}));
 const {data:order}=await admin.from("website_domain_orders").select("id,status,provider_order_id,purchase_price,purchase_confirmed_at").eq("business_id",business.id).eq("domain_name",domain).maybeSingle();
 if(!order)redirect(websiteFirstTarget(slug,"preview","error","Check availability before registering this domain.",{domainChoice:"need_domain",domainStage:"details"}));
 if(order.provider_order_id||["registration_pending","registered","connected"].includes(order.status))redirect(websiteFirstTarget(slug,"preview","error","This domain already has a protected registration attempt. It was not purchased again.",{domainChoice:"need_domain",domainStage:"registered"}));
 const country=text(data,"country").toUpperCase(),rawPhone=text(data,"phone"),digits=rawPhone.replace(/\D/g,""),phone=country==="US"?(digits.length===10?`+1${digits}`:digits.length===11&&digits.startsWith("1")?`+${digits}`:rawPhone.startsWith("+")?`+${digits}`:rawPhone):rawPhone.startsWith("+")?`+${digits}`:rawPhone;
 const registrant:VercelRegistrant={firstName:text(data,"firstName"),lastName:text(data,"lastName"),companyName:text(data,"companyName")||undefined,email:text(data,"email"),phone,address1:text(data,"address1"),address2:text(data,"address2")||undefined,city:text(data,"city"),state:text(data,"state"),zip:text(data,"zip"),country};
 if(!registrant.firstName||!registrant.lastName||!/^\S+@\S+\.\S+$/.test(registrant.email)||!/^\+[1-9]\d{7,14}$/.test(phone)||!registrant.address1||!registrant.city||!registrant.state||!registrant.zip||!/^[A-Z]{2}$/.test(country))redirect(websiteFirstTarget(slug,"preview","error","Complete the registrant contact information. Phone formatting is handled automatically.",{domainChoice:"need_domain",domainStage:"details"}));
 if(process.env.GOOGLE_MAPS_API_KEY){const verified=await resolveGoogleAddress({line1:registrant.address1,line2:registrant.address2,city:registrant.city,region:registrant.state,postalCode:registrant.zip,countryCode:registrant.country});if(verified.status!=="verified"||!verified.normalizedAddress)redirect(websiteFirstTarget(slug,"preview","error","Google could not verify the registrant address. Choose a suggestion or confirm every address field.",{domainChoice:"need_domain",domainStage:"details"}));registrant.address1=verified.normalizedAddress.line1??registrant.address1;registrant.address2=registrant.address2??verified.normalizedAddress.line2??undefined;registrant.city=verified.normalizedAddress.city??registrant.city;registrant.state=verified.normalizedAddress.region??registrant.state;registrant.zip=verified.normalizedAddress.postalCode??registrant.zip;registrant.country=verified.normalizedAddress.countryCode??registrant.country;}
 let quote:Awaited<ReturnType<typeof getVercelDomainQuote>>;try{quote=await getVercelDomainQuote(domain);}catch{redirect(websiteFirstTarget(slug,"preview","error","The current price could not be confirmed, so nothing was registered.",{domainChoice:"need_domain",domainStage:"details"}));}
 if(!quote.available)redirect(websiteFirstTarget(slug,"preview","error","The domain is no longer available and was not registered.",{domainChoice:"need_domain",domainStage:"search"}));
 if(quote.purchasePrice>standardDomainLimit())redirect(websiteFirstTarget(slug,"preview","error","This is now a premium domain and is not included. Nothing was registered.",{domainChoice:"need_domain",domainStage:"search"}));
 if(Number(order.purchase_price)!==quote.purchasePrice)redirect(websiteFirstTarget(slug,"preview","error","The domain price changed. Check availability again before registering.",{domainChoice:"need_domain",domainStage:"search"}));
 const now=new Date().toISOString(),{data:claimed}=await admin.from("website_domain_orders").update({status:"registration_pending",purchase_confirmed_at:now,updated_at:now,updated_by:user.id}).eq("id",order.id).eq("status","available").is("provider_order_id",null).select("id").maybeSingle();
 if(!claimed)redirect(websiteFirstTarget(slug,"preview","error","Another registration attempt already started. Servonas will check its status automatically.",{domainChoice:"need_domain",domainStage:"registered"}));
 try{const result=await buyVercelDomain(domain,quote.purchasePrice,registrant),renewalNotice=new Date();renewalNotice.setUTCDate(renewalNotice.getUTCDate()+335);await admin.from("website_domain_orders").update({provider_order_id:result.orderId,renewal_notice_at:renewalNotice.toISOString(),purchase_notification_status:"pending",purchase_notification_error:null,updated_at:new Date().toISOString(),updated_by:user.id,last_error_category:null}).eq("id",order.id).is("provider_order_id",null);await admin.from("business_website_onboarding_states").update({domain_request_status:"registration_pending",updated_at:new Date().toISOString(),updated_by:user.id}).eq("business_id",business.id).eq("requested_domain",domain);await admin.from("business_website_settings").update({custom_domain:domain,domain_status:"pending_verification",updated_at:new Date().toISOString(),updated_by:user.id}).eq("business_id",business.id);await notifyAcceptedDomainPurchase(admin,order.id,business);try{await addVercelProjectDomain(domain);}catch{console.error("Customer domain project attachment pending",{businessId:business.id,category:"project_attachment"});}}
 catch(error){const details=vercelDomainErrorDetails(error);console.error("Customer domain registration failed",{businessId:business.id,category:details.category,uncertain:details.uncertain});await admin.from("website_domain_orders").update({status:details.uncertain?"registration_pending":"failed",last_error_category:details.category,updated_at:new Date().toISOString(),updated_by:user.id}).eq("id",order.id).is("provider_order_id",null);redirect(websiteFirstTarget(slug,"preview","error",`${details.message} Nothing was retried automatically.`,{domainChoice:"need_domain",domainStage:"details"}));}
 revalidatePath("/onboarding");
 revalidatePath(`/onboarding?business=${slug}`);
 revalidatePath(`/app/${slug}/settings/website`);
 redirect(websiteFirstTarget(slug,"preview","success",`${domain} is registered. We&apos;re connecting it to your website now.`,{domainChoice:"need_domain",domainStage:"registered"}));
}

export async function syncManagedDomainRegistration(slug:string){
 const {admin,user,business,domain}=await managedDomainContext(slug),{data:order}=await admin.from("website_domain_orders").select("id,status,provider_order_id").eq("business_id",business.id).eq("domain_name",domain).maybeSingle();
 if(!order?.provider_order_id||!["registration_pending","registered"].includes(order.status))return {status:order?.status??"not_started"};
 await notifyAcceptedDomainPurchase(admin,order.id,business);
 let provider:Awaited<ReturnType<typeof getVercelDomainOrder>>;try{provider=await getVercelDomainOrder(order.provider_order_id);}catch{return {status:order.status};}
 const now=new Date().toISOString();if(provider.status==="failed"){await admin.from("website_domain_orders").update({status:"failed",last_error_category:"provider_order_failed",updated_at:now,updated_by:user.id}).eq("id",order.id);await admin.from("business_website_onboarding_states").update({domain_request_status:"failed",updated_at:now,updated_by:user.id}).eq("business_id",business.id).eq("requested_domain",domain);revalidatePath(`/app/${slug}/settings/website`);return {status:"failed"};}
 if(provider.status!=="completed")return {status:"registration_pending"};
 try{await addVercelProjectDomain(domain);const hosting=await getVercelDomainStatus(domain),status=hosting.verified&&!hosting.misconfigured?"connected":"registered";await admin.from("website_domain_orders").update({status,registered_at:now,updated_at:now,updated_by:user.id,last_error_category:null}).eq("id",order.id);await admin.from("business_website_onboarding_states").update({domain_request_status:status,updated_at:now,updated_by:user.id}).eq("business_id",business.id).eq("requested_domain",domain);await admin.from("business_website_settings").update({custom_domain:domain,domain_status:status==="connected"?"connected":"pending_verification",updated_at:now,updated_by:user.id}).eq("business_id",business.id);revalidatePath(`/app/${slug}/settings/website`);return {status};}catch{return {status:"registered"};}
}

export async function prepareWebsitePhotoUpload(slug:string,name:string,type:string,size:number){
 const {business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))throw new Error("Only owners and administrators can upload website photos.");
 const allowed=new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif"]);
 if(!allowed.has(type)||!Number.isFinite(size)||size<=0||size>8*1024*1024)throw new Error("Choose a JPG, PNG, WebP, GIF, or AVIF photo no larger than 8 MB.");
 const admin=getSupabaseAdmin();if(!admin)throw new Error("Website photo uploads are not configured.");
 const paths=buildImageVariantPaths(business.id,"webp");
 const [displayUpload,thumbUpload]=await Promise.all([
  admin.storage.from("website-assets").createSignedUploadUrl(paths.displayPath),
  admin.storage.from("website-assets").createSignedUploadUrl(paths.thumbPath),
 ]);
 if(displayUpload.error||!displayUpload.data||thumbUpload.error||!thumbUpload.data)throw new Error("The photo upload could not be prepared. Please try again.");
 return {
  bucket:"website-assets",
  display:{path:paths.displayPath,token:displayUpload.data.token,url:admin.storage.from("website-assets").getPublicUrl(paths.displayPath).data.publicUrl},
  thumb:{path:paths.thumbPath,token:thumbUpload.data.token,url:admin.storage.from("website-assets").getPublicUrl(paths.thumbPath).data.publicUrl},
  cacheControl:imageVariantCacheControl(),
  name:name.slice(0,180),
 };
}

export async function openWebsiteAiImageGenerator(slug:string,section="website_photos"){
 const {business,user,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))throw new Error("Only owners and administrators can generate website photos.");
 await recordWebsiteAiImageEvent({businessId:business.id,userId:user.id,eventName:"website_ai_image_opened",metadata:{industry:business.industry_profile,section,business_slug:business.slug,timestamp:new Date().toISOString()}});
 return {ok:true};
}

export async function openWebsiteAiImageGeneratorSafe(slug:string,section="website_photos"):Promise<{ok:true}|{ok:false;error:string}>{
 try{await openWebsiteAiImageGenerator(slug,section);return {ok:true};}catch(error){console.error("Website AI image generator open failed",{slug,message:error instanceof Error?error.message:"unknown"});return {ok:false,error:error instanceof Error?error.message:safeWebsiteAiMessage()};}
}

export async function generateWebsiteAiPhoto(slug:string,input:{idempotencyKey:string;section:string;imageType:WebsiteAiImageType;customDescription?:string|null;size?:string|null;quality?:string|null;generationKind?:WebsiteAiImageGenerationKind;replacesGenerationId?:string|null;}){
 const {business,user,role,entitlementSummary}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))throw new Error("Only owners and administrators can generate website photos.");
 if(!process.env.OPENAI_API_KEY?.trim())throw new Error(safeWebsiteAiMessage("missing_openai"));
 if(!input?.idempotencyKey?.trim())throw new Error(safeWebsiteAiMessage());
 const admin=getSupabaseAdmin();if(!admin)throw new Error(safeWebsiteAiMessage("missing_supabase"));
 const usage=await websiteAiGenerationUsageCount(business.id),limit=websiteAiImageLimit(entitlementSummary);
 if(limit>=0&&usage>=limit){
  await recordWebsiteAiImageEvent({businessId:business.id,userId:user.id,eventName:"website_ai_image_limit_reached",metadata:{industry:business.industry_profile,section:input.section,image_type:input.imageType,limit,current_usage:usage,business_slug:business.slug,timestamp:new Date().toISOString()}});
  throw new Error("You've reached the current AI photo generation limit for this workspace.");
 }
 const imageSize=normalizeWebsiteAiImageSize(input.size),imageQuality=normalizeWebsiteAiImageQuality(input.quality),generationKind=input.generationKind==="regeneration"?"regeneration":"initial";
 const [{data:services},{data:territories},{data:websiteState},{data:websiteSettings},websiteId]=await Promise.all([
  admin.from("services").select("name").eq("business_id",business.id).eq("active",true).eq("is_deleted",false).order("sort_order").order("name"),
  admin.from("workforce_territories").select("name").eq("business_id",business.id).eq("is_active",true).order("name"),
  admin.from("business_website_onboarding_states").select("source").eq("business_id",business.id).maybeSingle(),
  admin.from("business_website_settings").select("id").eq("business_id",business.id).maybeSingle(),
  currentWebsiteId(business.id),
 ]);
 const prompt=buildWebsiteAiImagePrompt({businessId:business.id,businessName:business.name,industryProfile:business.industry_profile,websiteSource:websiteState?.source??null,city:business.city??null,state:business.state??null,serviceAreas:(territories??[]).map((item:any)=>String(item.name)).filter(Boolean),services:(services??[]).map((item:any)=>String(item.name)).filter(Boolean),section:input.section,imageType:input.imageType,customDescription:input.customDescription??null});
 const claimed=await admin.from("website_ai_image_generations").insert({
  business_id:business.id,user_id:user.id,website_id:websiteSettings?.id??websiteId,feature:websiteAiImageFeature,provider:"openai",model:websiteAiImageModel,generation_kind:generationKind,status:"generating",image_type:input.imageType,image_size:imageSize,image_quality:imageQuality,image_count:1,prompt,idempotency_key:input.idempotencyKey,prompt_metadata:{industry:business.industry_profile,website_source:websiteState?.source??null,section:input.section,custom_description:input.customDescription??null,service_count:(services??[]).length,service_area_count:(territories??[]).length,replaces_generation_id:input.replacesGenerationId??null},outcome:"generated"
 }).select("id").maybeSingle();
 if(claimed.error){
  if(claimed.error.code==="23505"){
   const {data:existing}=await admin.from("website_ai_image_generations").select("id,status,temporary_public_url,error_message").eq("business_id",business.id).eq("idempotency_key",input.idempotencyKey).maybeSingle();
   if(existing?.status==="generated"&&existing.temporary_public_url)return {generationId:existing.id,imageUrl:existing.temporary_public_url};
   throw new Error(existing?.status==="generating"?"That photo is already being created.":"Please try again with a new request.");
  }
  throw new Error(safeWebsiteAiMessage());
 }
 const generationId=claimed.data!.id;
 await recordWebsiteAiImageEvent({businessId:business.id,userId:user.id,generationId,eventName:generationKind==="regeneration"?"website_ai_image_regenerated":"website_ai_image_generation_started",metadata:{industry:business.industry_profile,section:input.section,image_type:input.imageType,business_slug:business.slug,timestamp:new Date().toISOString()}});
 try{
  const response=await fetch("https://api.openai.com/v1/images/generations",{method:"POST",headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY.trim()}`,"Content-Type":"application/json","X-Client-Request-Id":input.idempotencyKey},body:JSON.stringify({model:websiteAiImageModel,prompt,size:imageSize,quality:imageQuality,n:1,background:"auto",moderation:"auto",output_format:"png"})});
  if(!response.ok)throw new Error("provider_unavailable");
  const body=await response.json() as {created?:number;data?:Array<{b64_json?:string}>;id?:string};
  const imageBase64=body.data?.[0]?.b64_json;
  if(!imageBase64)throw new Error("provider_invalid_output");
  const binary=Buffer.from(imageBase64,"base64"),storagePath=`${business.id}/generated/${generationId}.png`,upload=await admin.storage.from("website-assets").upload(storagePath,binary,{contentType:"image/png",upsert:false});
  if(upload.error)throw new Error("storage_failed");
  const occurredAt=new Date().toISOString(),pricing=await websiteAiImagePricing(websiteAiImageModel,imageSize,imageQuality,occurredAt),providerCost=estimateWebsiteAiImageCost(pricing?Number(pricing.usd_per_image):null,1),publicUrl=admin.storage.from("website-assets").getPublicUrl(storagePath).data.publicUrl;
  await admin.from("website_ai_image_generations").update({provider_request_id:typeof body.id==="string"?body.id:null,status:"generated",temporary_storage_path:storagePath,temporary_public_url:publicUrl,provider_cost_usd:providerCost,pricing_status:pricing?"priced":"unpriced",pricing_snapshot:pricing?{pricingId:pricing.id,usdPerImage:Number(pricing.usd_per_image),sourceUrl:pricing.source_url}:null,completed_at:occurredAt,updated_at:occurredAt}).eq("id",generationId).eq("business_id",business.id);
  if(input.replacesGenerationId){
   const {data:prior}=await admin.from("website_ai_image_generations").select("temporary_storage_path").eq("id",input.replacesGenerationId).eq("business_id",business.id).maybeSingle();
   await admin.from("website_ai_image_generations").update({status:"replaced",outcome:"replaced",updated_at:occurredAt}).eq("id",input.replacesGenerationId).eq("business_id",business.id).in("status",["generated","discarded"]);
   if(prior?.temporary_storage_path)await admin.storage.from("website-assets").remove([prior.temporary_storage_path]).catch(()=>undefined);
  }
  await recordWebsiteAiImageEvent({businessId:business.id,userId:user.id,generationId,eventName:"website_ai_image_generation_completed",metadata:{industry:business.industry_profile,section:input.section,image_type:input.imageType,business_slug:business.slug,timestamp:occurredAt}});
  return {generationId,imageUrl:publicUrl};
 }catch(error){
  await admin.from("website_ai_image_generations").update({status:"failed",outcome:"failed",error_message:safeWebsiteAiMessage(),updated_at:new Date().toISOString(),completed_at:new Date().toISOString()}).eq("id",generationId).eq("business_id",business.id);
  await recordWebsiteAiImageEvent({businessId:business.id,userId:user.id,generationId,eventName:"website_ai_image_generation_failed",metadata:{industry:business.industry_profile,section:input.section,image_type:input.imageType,business_slug:business.slug,timestamp:new Date().toISOString()}});
  console.error("Website AI image generation failed",{businessId:business.id,generationId,message:error instanceof Error?error.message:"unknown"});
  throw new Error(safeWebsiteAiMessage());
 }
}

export async function generateWebsiteAiPhotoSafe(slug:string,input:{idempotencyKey:string;section:string;imageType:WebsiteAiImageType;customDescription?:string|null;size?:string|null;quality?:string|null;generationKind?:WebsiteAiImageGenerationKind;replacesGenerationId?:string|null;}):Promise<{ok:true;generationId:string;imageUrl:string}|{ok:false;error:string}>{
 try{const result=await generateWebsiteAiPhoto(slug,input);return {ok:true,generationId:result.generationId,imageUrl:result.imageUrl};}
 catch(error){console.error("Website AI image request failed",{slug,message:error instanceof Error?error.message:"unknown"});return {ok:false,error:error instanceof Error?error.message:safeWebsiteAiMessage()};}
}

export async function saveWebsiteAiPhoto(slug:string,generationId:string){
 const {business,user,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))throw new Error("Only owners and administrators can save website photos.");
 const admin=getSupabaseAdmin();if(!admin)throw new Error("Website photo storage is unavailable.");
 const {data:generation}=await admin.from("website_ai_image_generations").select("id,status,temporary_public_url").eq("id",generationId).eq("business_id",business.id).maybeSingle();
 if(!generation?.temporary_public_url||!["generated","saved"].includes(generation.status))throw new Error("This AI photo is no longer available.");
 await admin.from("website_ai_image_generations").update({status:"saved",outcome:"saved",saved_photo_url:generation.temporary_public_url,updated_at:new Date().toISOString()}).eq("id",generationId).eq("business_id",business.id);
 await recordWebsiteAiImageEvent({businessId:business.id,userId:user.id,generationId,eventName:"website_ai_image_saved",metadata:{industry:business.industry_profile,business_slug:business.slug,timestamp:new Date().toISOString()}});
 return {url:generation.temporary_public_url};
}

export async function saveWebsiteAiPhotoSafe(slug:string,generationId:string):Promise<{ok:true;url:string}|{ok:false;error:string}>{
 try{const result=await saveWebsiteAiPhoto(slug,generationId);return {ok:true,url:result.url};}
 catch(error){console.error("Website AI image save failed",{slug,generationId,message:error instanceof Error?error.message:"unknown"});return {ok:false,error:error instanceof Error?error.message:safeWebsiteAiMessage("save_failed")};}
}

export async function discardWebsiteAiPhoto(slug:string,generationId:string){
 const {business,user,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))throw new Error("Only owners and administrators can discard website photos.");
 const admin=getSupabaseAdmin();if(!admin)throw new Error("Website photo storage is unavailable.");
 const {data:generation}=await admin.from("website_ai_image_generations").select("id,status,temporary_storage_path").eq("id",generationId).eq("business_id",business.id).maybeSingle();
 if(!generation||!["generated","failed"].includes(generation.status))return {ok:true};
 if(generation.temporary_storage_path)await admin.storage.from("website-assets").remove([generation.temporary_storage_path]).catch(()=>undefined);
 await admin.from("website_ai_image_generations").update({status:"discarded",outcome:"discarded",temporary_storage_path:null,temporary_public_url:null,updated_at:new Date().toISOString()}).eq("id",generationId).eq("business_id",business.id);
 await recordWebsiteAiImageEvent({businessId:business.id,userId:user.id,generationId,eventName:"website_ai_image_discarded",metadata:{industry:business.industry_profile,business_slug:business.slug,timestamp:new Date().toISOString()}});
 return {ok:true};
}

export async function discardWebsiteAiPhotoSafe(slug:string,generationId:string):Promise<{ok:true}|{ok:false;error:string}>{
 try{await discardWebsiteAiPhoto(slug,generationId);return {ok:true};}catch(error){console.error("Website AI image discard failed",{slug,generationId,message:error instanceof Error?error.message:"unknown"});return {ok:false,error:error instanceof Error?error.message:safeWebsiteAiMessage("discard_failed")};}
}

export async function saveWebsiteSettings(slug:string,data:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))redirect(target(slug,"error","Only owners and administrators can manage the website."));
 const publicSlug=text(data,"publicSlug").toLowerCase(),template=text(data,"template"),primary=text(data,"primaryColor"),secondary=text(data,"secondaryColor"),floralFontStyle=text(data,"floralFontStyle")||"elegant",floralAccentColor=text(data,"floralAccentColor")||"#b85c7c",floralBackgroundColor=text(data,"floralBackgroundColor")||"#fffafc",floralPhotoLayout=text(data,"floralPhotoLayout")||"hero_right",customDomainRaw=text(data,"customDomain"),customDomain=normalizeWebsiteDomain(customDomainRaw),googleReviewUrl=text(data,"googleReviewUrl"),instagramRaw=text(data,"instagramUrl"),instagramUrl=normalizeInstagramUrl(instagramRaw),requestedGooglePlaceId=text(data,"googlePlaceId"),manualPhotoUrls=urls(text(data,"photoUrls")),googleReviews=reviews(data);
 const photoFiles=data.getAll("websitePhotos").filter((entry):entry is File=>entry instanceof File&&entry.size>0);
 if(!validWebsiteSlug(publicSlug))redirect(target(slug,"error","Use lowercase letters, numbers, and hyphens for the website URL."));
 if(!websiteTemplates.includes(template as typeof websiteTemplates[number]))redirect(target(slug,"error","Choose a valid website template."));
 if(!validWebsiteColor(primary)||!validWebsiteColor(secondary))redirect(target(slug,"error","Choose valid six-digit brand colors."));
 if(!["elegant","romantic","modern"].includes(floralFontStyle)||!["hero_right","hero_left","hero_full","gallery_first"].includes(floralPhotoLayout)||!validWebsiteColor(floralAccentColor)||!validWebsiteColor(floralBackgroundColor))redirect(target(slug,"error","Choose valid floral website design options."));
 if(customDomainRaw&&!customDomain)redirect(target(slug,"error","Enter a valid domain name."));
 if(googleReviewUrl){try{const url=new URL(googleReviewUrl);if(url.protocol!=="https:")throw new Error();}catch{redirect(target(slug,"error","The Google review link must be a secure HTTPS URL."));}}
 if(instagramRaw&&!instagramUrl)redirect(target(slug,"error","Enter an Instagram username or profile link, such as @yourbusiness."));
 if(googleReviews.some(review=>review.author.length<1||review.author.length>100||review.text.length<3||review.text.length>600||!Number.isInteger(review.rating)||review.rating<1||review.rating>5))redirect(target(slug,"error","Complete each Google review with a customer name, rating, and review text."));
 if(manualPhotoUrls.some(url=>{try{return new URL(url).protocol!=="https:";}catch{return true;}}))redirect(target(slug,"error","Every photo must use a valid HTTPS URL."));
 const allowedPhotoTypes=new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif"]);
 if(photoFiles.length>6)redirect(target(slug,"error","Upload up to 6 website photos at a time."));
 if(photoFiles.some(file=>file.size>8*1024*1024||!allowedPhotoTypes.has(file.type)))redirect(target(slug,"error","Use JPG, PNG, WebP, GIF, or AVIF photos under 8MB each."));
 if(manualPhotoUrls.length+photoFiles.length>24)redirect(target(slug,"error","A website can display up to 24 photos."));
 const [{data:existing},{data:businessAddress}]=await Promise.all([supabase.from("business_website_settings").select("custom_domain,status,google_place_id,photo_urls").eq("business_id",business.id).maybeSingle(),supabase.from("businesses").select("name,address_line1,city,state,postal_code").eq("id",business.id).maybeSingle()]);
 const expectedGoogleBusiness=businessAddress?{name:businessAddress.name,address:[businessAddress.address_line1,businessAddress.city,businessAddress.state,businessAddress.postal_code].filter(Boolean).join(", ")}:null;
 let googlePlace:Awaited<ReturnType<typeof findGoogleBusinessPlace>>|null=null;
 if(requestedGooglePlaceId){if(!expectedGoogleBusiness?.address)redirect(target(slug,"error","Add the complete business address in Servonas before connecting a Google Place ID."));googlePlace=await resolveGoogleBusinessPlaceId(requestedGooglePlaceId,expectedGoogleBusiness);}
 else if(googleReviewUrl&&expectedGoogleBusiness)googlePlace=await findGoogleBusinessPlace(expectedGoogleBusiness);
 if(googlePlace&&!googlePlace.ok){await supabase.from("business_website_settings").update({google_place_id:null,google_place_name:null,google_place_address:null}).eq("business_id",business.id);revalidatePath(`/sites/${publicSlug}`);redirect(target(slug,"error",`Google rating was disconnected: ${googlePlace.error}`));}
 const uploadedPaths:string[]=[],uploadedUrls:string[]=[];
 if(photoFiles.length){
  const admin=getSupabaseAdmin();if(!admin)redirect(target(slug,"error","Website photo uploads are not configured."));
  for(const file of photoFiles){
   const paths=buildImageVariantPaths(business.id,file.type==="image/webp"?"webp":"jpg");
   const {error:uploadError}=await admin.storage.from("website-assets").upload(paths.displayPath,file,{contentType:file.type,upsert:false,cacheControl:imageVariantCacheControl()});
   if(uploadError){if(uploadedPaths.length)await admin.storage.from("website-assets").remove(uploadedPaths);console.error("Website photo upload failed",{businessId:business.id,message:uploadError.message});redirect(target(slug,"error","One or more website photos could not be uploaded. Apply the website-assets migration first."));}
   uploadedPaths.push(paths.displayPath);uploadedUrls.push(admin.storage.from("website-assets").getPublicUrl(paths.displayPath).data.publicUrl);
  }
 }
 const photoUrls=[...new Set([...manualPhotoUrls,...uploadedUrls])].slice(0,24);
 const removedManagedPhotos=(existing?.photo_urls??[]).filter((url:string)=>!photoUrls.includes(url)).flatMap((url:string)=>managedImageVariantPathsFromPublicUrl(url,"website-assets"));
 const domainStatus=!customDomain?"not_connected":existing?.custom_domain===customDomain?undefined:"not_connected";
 const {error}=await supabase.from("business_website_settings").upsert({business_id:business.id,public_slug:publicSlug,template_key:template,primary_color:primary,secondary_color:secondary,floral_font_style:floralFontStyle,floral_accent_color:floralAccentColor,floral_background_color:floralBackgroundColor,floral_photo_layout:floralPhotoLayout,hero_heading:text(data,"heroHeading")||null,hero_subheading:text(data,"heroSubheading")||null,about_text:text(data,"aboutText")||null,instagram_url:instagramUrl,google_review_url:googleReviewUrl||null,google_place_id:googlePlace?.ok?googlePlace.placeId:null,google_place_name:googlePlace?.ok?googlePlace.displayName:null,google_place_address:googlePlace?.ok?googlePlace.formattedAddress:null,google_reviews:googleReviews,photo_urls:photoUrls,request_service_enabled:data.get("requestEnabled")==="on",booking_enabled:data.get("bookingEnabled")==="on",custom_domain:customDomain,...(domainStatus?{domain_status:domainStatus}:{}),updated_by:user.id},{onConflict:"business_id"});
 if(error){const admin=getSupabaseAdmin();if(admin&&uploadedPaths.length)await admin.storage.from("website-assets").remove(uploadedPaths);console.error("Website settings save failed",{businessId:business.id,code:error.code});redirect(target(slug,"error",error.code==="23505"?"That website URL or domain is already in use.":"Website settings could not be saved. Apply the website migration first."));}
 if(removedManagedPhotos.length){
  const admin=getSupabaseAdmin();
  await admin?.storage.from("website-assets").remove(removedManagedPhotos);
 }
 if(business.industry_profile==="party_rental"){
  const {error:bookingRepairError}=await supabase.from("booking_settings").update({enabled:true,public_slug:publicSlug,updated_at:new Date().toISOString(),updated_by:user.id}).eq("business_id",business.id);
  if(bookingRepairError)console.error("Party-rental website booking repair failed",{businessId:business.id,code:bookingRepairError.code});
 }
 const availability=[] as {business_id:string;weekday:number;start_time:string;end_time:string;active:boolean}[];
 for(let weekday=0;weekday<7;weekday++){
  const active=data.get(`websiteDay_${weekday}`)==="on",start=text(data,`websiteStart_${weekday}`)||"09:00",end=text(data,`websiteEnd_${weekday}`)||"17:00";
  if(active&&(!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end)||end<=start))redirect(target(slug,"error","Each open day needs a closing time later than its opening time.","hours"));
  availability.push({business_id:business.id,weekday,start_time:start,end_time:end,active});
 }
 const {error:clearHoursError}=await supabase.from("booking_availability").delete().eq("business_id",business.id);
 if(clearHoursError)redirect(target(slug,"error","Business hours could not be updated.","hours"));
 const {error:hoursError}=await supabase.from("booking_availability").insert(availability);
 if(hoursError)redirect(target(slug,"error","Business hours could not be updated.","hours"));
 const areaIds=data.getAll("websiteAreaId").map(String),areaNames=data.getAll("websiteAreaName").map(value=>String(value).trim()),removeIds=new Set(data.getAll("websiteRemoveAreaId").map(String)),newAreas=[...new Set(text(data,"websiteNewAreas").split(/\r?\n|,/).map(value=>value.trim()).filter(Boolean))];
 if(areaNames.some(name=>!name||name.length>150)||newAreas.some(name=>name.length>150))redirect(target(slug,"error","Service area names must contain between 1 and 150 characters.","hours"));
 if(areaIds.length!==areaNames.length)redirect(target(slug,"error","Service areas could not be verified. Refresh and try again.","hours"));
 if(areaIds.length){const {data:owned}=await supabase.from("workforce_territories").select("id").eq("business_id",business.id).in("id",areaIds);if((owned??[]).length!==new Set(areaIds).size)redirect(target(slug,"error","One or more service areas could not be verified.","hours"));}
 for(let index=0;index<areaIds.length;index++){const {error:areaError}=await supabase.from("workforce_territories").update(removeIds.has(areaIds[index])?{is_active:false,updated_by:user.id,updated_at:new Date().toISOString()}:{name:areaNames[index],updated_by:user.id,updated_at:new Date().toISOString()}).eq("business_id",business.id).eq("id",areaIds[index]);if(areaError)redirect(target(slug,"error",areaError.code==="23505"?"Each service area needs a unique name.":"Service areas could not be updated.","hours"));}
 if(newAreas.length){const {error:newAreaError}=await supabase.from("workforce_territories").insert(newAreas.map(name=>({business_id:business.id,name,territory_type:"mixed",postal_codes:[],neighborhoods:[],is_active:true,created_by:user.id,updated_by:user.id})));if(newAreaError)redirect(target(slug,"error",newAreaError.code==="23505"?"Each service area needs a unique name.":"New service areas could not be added.","hours"));}
 revalidatePath(`/app/${slug}/settings/website`);revalidatePath(`/app/${slug}/booking`);revalidatePath(`/app/${slug}/territories`);revalidatePath(`/book/${publicSlug}`);revalidatePath(`/sites/${publicSlug}`);redirect(target(slug,"success","Website settings saved.",text(data,"websiteStep")));
}

export async function disconnectGoogleBusinessProfile(slug:string){
 const {business,role}=await requireWorkspaceCapability(slug,"business_onboarding");if(!canManageBusiness(role))redirect(target(slug,"error","Only owners and administrators can disconnect Google."));const admin=getSupabaseAdmin();if(!admin)redirect(target(slug,"error","Google connection storage is unavailable."));const {error}=await admin.from("business_google_profile_connections").delete().eq("business_id",business.id);if(error)redirect(target(slug,"error","Google Business Profile could not be disconnected."));revalidatePath(`/app/${slug}/settings/website`);redirect(target(slug,"success","Google Business Profile disconnected."));
}

export async function setWebsitePublished(slug:string,data:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))redirect(target(slug,"error","Only owners and administrators can publish the website."));
 const publish=data.get("publish")==="true";
 const [{data:settings},{data:websiteFirst}]=await Promise.all([
  supabase.from("business_website_settings").select("id,public_slug").eq("business_id",business.id).maybeSingle(),
  supabase.from("business_website_onboarding_states").select("business_id").eq("business_id",business.id).maybeSingle(),
 ]);
 if(!settings)redirect(target(slug,"error","Save the website settings before publishing."));
 const {error}=await supabase.from("business_website_settings").update({status:publish?"published":"draft",published_at:publish?new Date().toISOString():null,updated_by:user.id}).eq("business_id",business.id).eq("id",settings.id);
 if(error)redirect(target(slug,"error","Website publishing status could not be changed."));
 if(publish&&websiteFirst){
  const admin=getSupabaseAdmin();if(admin){const {data:session}=await admin.from("website_acquisition_sessions").select("id,industry,user_id").eq("business_id",business.id).order("last_seen_at",{ascending:false}).limit(1).maybeSingle();if(session)await linkAcquisitionSession(admin,{sessionId:session.id,industry:session.industry,userId:session.user_id,businessId:business.id,event:"website_published"});}
 }
 revalidatePath(`/app/${slug}/settings/website`);revalidatePath(`/sites/${settings.public_slug}`);
 if(publish&&websiteFirst){
  if(returnToWebsiteFirst(slug,data))redirect(websiteFirstTarget(slug,"live","success","Your website is live."));
  redirect(`/app/${slug}/settings/website/success`);
 }
 redirect(target(slug,"success",publish?"Website published.":"Website unpublished. The public URL is no longer available."));
}

export async function completeWebsiteFirstLaunch(slug:string,data:FormData){
 const {supabase,business}=await requireWorkspaceCapability(slug,"business_onboarding");
 const {data:website}=await supabase.from("business_website_settings").select("status").eq("business_id",business.id).maybeSingle();
 if(website?.status!=="published")redirect(websiteFirstTarget(slug,"preview","error","Publish your website before finishing launch."));
 await completeWebsiteFirstLaunchState(slug,business.id,supabase);
 redirect(websiteFirstTarget(slug,"live","success",data.get("choice")==="servonas_url"?"Your website is live with its Servonas address.":"Your website is live."));
}

export async function completeWebsiteFirstAndExplore(slug:string){
 const {supabase,business}=await requireWorkspaceCapability(slug,"business_onboarding");
 const {data:website}=await supabase.from("business_website_settings").select("status").eq("business_id",business.id).maybeSingle();
 if(website?.status!=="published")redirect(target(slug,"error","Publish your website before exploring Servonas."));
 const now=new Date().toISOString();
 const {error}=await supabase.from("business_website_onboarding_states").update({current_step:"completed",completed_at:now,updated_at:now}).eq("business_id",business.id);
 if(error){console.error("Website-first exploration completion failed",{businessId:business.id,code:error.code});redirect(`/app/${slug}/settings/website/success?error=${encodeURIComponent("Website setup could not be completed. Try again.")}`);}
 revalidatePath(`/app/${slug}`);
 redirect(`/app/${slug}`);
}

export async function connectWebsiteDomain(slug:string,data:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))redirect(target(slug,"error","Only owners and administrators can connect a domain."));
 const domain=normalizeWebsiteDomain(text(data,"customDomain"));
 if(!domain)redirect(returnToWebsiteFirst(slug,data)?websiteFirstTarget(slug,"preview","error","Enter and save a valid domain name first.",{domainChoice:"existing_domain",domainStage:"search"}):target(slug,"error","Enter and save a valid domain name first."));
 const {data:settings}=await supabase.from("business_website_settings").select("id").eq("business_id",business.id).maybeSingle();
 if(!settings)redirect(returnToWebsiteFirst(slug,data)?websiteFirstTarget(slug,"preview","error","Save the website settings before connecting a domain.",{domainChoice:"existing_domain",domainStage:"search"}):target(slug,"error","Save the website settings before connecting a domain."));
 const {error:saveError}=await supabase.from("business_website_settings").update({custom_domain:domain,domain_status:"pending_verification",updated_by:user.id}).eq("business_id",business.id).eq("id",settings.id);
 if(saveError)redirect(returnToWebsiteFirst(slug,data)?websiteFirstTarget(slug,"preview","error",saveError.code==="23505"?"That domain is already connected to another Servonas website.":"The domain could not be saved.",{domainChoice:"existing_domain",domainStage:"search"}):target(slug,"error",saveError.code==="23505"?"That domain is already connected to another Servonas website.":"The domain could not be saved."));
 try{await addVercelProjectDomain(domain);}catch(error){console.error("Website domain registration failed",{businessId:business.id,domain,error:error instanceof Error?error.message:"unknown"});redirect(returnToWebsiteFirst(slug,data)?websiteFirstTarget(slug,"preview","error","Servonas could not register this domain with hosting. Check the domain configuration and try again.",{domainChoice:"existing_domain",domainStage:"search"}):target(slug,"error","Servonas could not register this domain with hosting. Check the domain configuration and try again."));}
 revalidatePath(`/app/${slug}/settings/website`);
 if(returnToWebsiteFirst(slug,data))redirect(websiteFirstTarget(slug,"preview","success","Domain saved. Add the DNS records below, then return and check the connection.",{domainChoice:"existing_domain",domainStage:"search"}));
 redirect(target(slug,"success","Domain added. Update the displayed DNS records, then select Check connection."));
}

export async function checkWebsiteDomain(slug:string,data:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))redirect(target(slug,"error","Only owners and administrators can verify a domain."));
 const domain=normalizeWebsiteDomain(text(data,"customDomain"));
 if(!domain)redirect(returnToWebsiteFirst(slug,data)?websiteFirstTarget(slug,"preview","error","Enter a valid domain name before checking the connection.",{domainChoice:"existing_domain",domainStage:"search"}):target(slug,"error","Enter a valid domain name before checking the connection."));
 let {data:settings}=await supabase.from("business_website_settings").select("id,custom_domain").eq("business_id",business.id).maybeSingle();
 if(!settings){
  const publicSlug=text(data,"publicSlug").toLowerCase();
  if(!validWebsiteSlug(publicSlug))redirect(returnToWebsiteFirst(slug,data)?websiteFirstTarget(slug,"preview","error","Enter a valid Servonas website URL before connecting the domain.",{domainChoice:"existing_domain",domainStage:"search"}):target(slug,"error","Enter a valid Servonas website URL before connecting the domain."));
  const {data:created,error}=await supabase.from("business_website_settings").insert({business_id:business.id,public_slug:publicSlug,custom_domain:domain,domain_status:"pending_verification",updated_by:user.id}).select("id,custom_domain").single();
  if(error||!created)redirect(returnToWebsiteFirst(slug,data)?websiteFirstTarget(slug,"preview","error",error?.code==="23505"?"That domain is already connected to another Servonas website.":"The domain could not be saved.",{domainChoice:"existing_domain",domainStage:"search"}):target(slug,"error",error?.code==="23505"?"That domain is already connected to another Servonas website.":"The domain could not be saved."));
  settings=created;
 }else if(settings.custom_domain!==domain){
  const {error}=await supabase.from("business_website_settings").update({custom_domain:domain,domain_status:"pending_verification",updated_by:user.id}).eq("business_id",business.id).eq("id",settings.id);
  if(error)redirect(returnToWebsiteFirst(slug,data)?websiteFirstTarget(slug,"preview","error",error.code==="23505"?"That domain is already connected to another Servonas website.":"The domain could not be saved.",{domainChoice:"existing_domain",domainStage:"search"}):target(slug,"error",error.code==="23505"?"That domain is already connected to another Servonas website.":"The domain could not be saved."));
  settings={...settings,custom_domain:domain};
 }
 let connected=false;
 try{
  await addVercelProjectDomain(domain);
  const before=await getVercelDomainStatus(domain);
  if(!before.verified)try{await verifyVercelProjectDomain(domain);}catch{/* The verification record remains visible for the customer. */}
  const current=await getVercelDomainStatus(domain);connected=current.verified&&!current.misconfigured;
  await supabase.from("business_website_settings").update({custom_domain:domain,domain_status:connected?"connected":"pending_verification",updated_by:user.id}).eq("business_id",business.id).eq("id",settings.id);
 }catch(error){console.error("Website domain verification failed",{businessId:business.id,domain,error:error instanceof Error?error.message:"unknown"});redirect(returnToWebsiteFirst(slug,data)?websiteFirstTarget(slug,"preview","error","The domain connection could not be checked. Try again shortly.",{domainChoice:"existing_domain",domainStage:"search"}):target(slug,"error","The domain connection could not be checked. Try again shortly."));}
 revalidatePath(`/app/${slug}/settings/website`);
 if(returnToWebsiteFirst(slug,data))redirect(websiteFirstTarget(slug,"preview",connected?"success":"error",connected?"Domain connected. SSL will be issued automatically and the website is ready on this address.":"The DNS changes have not finished propagating. Confirm the records below and try again shortly.",{domainChoice:"existing_domain",domainStage:"search"}));
 redirect(target(slug,connected?"success":"error",connected?"Domain connected. SSL will be issued automatically and the website is ready on this address.":"The DNS changes have not finished propagating. Confirm the records below and try again shortly."));
}

export async function uploadWebsiteLogo(slug:string,data:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))redirect(target(slug,"error","Only owners and administrators can change the logo."));
 const file=data.get("logo");if(!(file instanceof File)||!file.size)redirect(target(slug,"error","Choose a logo image."));
 if(file.size>5*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type))redirect(target(slug,"error","Use a JPG, PNG, or WebP logo under 5MB."));
 const {data:booking}=await supabase.from("booking_settings").select("logo_path,public_slug").eq("business_id",business.id).maybeSingle();
 const extension=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg",path=`${business.id}/website-logo-${crypto.randomUUID()}.${extension}`;
 const {error:uploadError}=await supabase.storage.from("booking-branding").upload(path,file,{contentType:file.type,upsert:false});
 if(uploadError)redirect(target(slug,"error","The logo could not be uploaded."));
 const {error}=await supabase.from("booking_settings").upsert({business_id:business.id,public_slug:booking?.public_slug??business.slug,logo_path:path,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:"business_id"});
 if(error){await supabase.storage.from("booking-branding").remove([path]);redirect(target(slug,"error","The logo could not be saved."));}
 if(booking?.logo_path&&booking.logo_path!==path)await supabase.storage.from("booking-branding").remove([booking.logo_path]);
 revalidatePath(`/app/${slug}/settings/website`);redirect(target(slug,"success","Website logo updated."));
}

export async function updateWebsiteLeadStatus(slug:string,data:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"customer_management");
 const status=text(data,"status"),requestId=text(data,"requestId");
 if(!canManageBusiness(role)||!["new","contacted","qualified","booked","lost"].includes(status))redirect(target(slug,"error","The request status could not be changed."));
 const {error}=await supabase.from("website_service_requests").update({lead_status:status}).eq("business_id",business.id).eq("id",requestId);
 if(error)redirect(target(slug,"error","The request status could not be saved."));
 revalidatePath(`/app/${slug}/settings/website`);redirect(target(slug,"success","Request status updated."));
}
