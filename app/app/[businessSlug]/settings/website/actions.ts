"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageBusiness} from "@/lib/access";
import {requireWorkspaceCapability} from "@/lib/workspace";
import {normalizeWebsiteDomain,validWebsiteColor,validWebsiteSlug,websiteTemplates} from "@/lib/website";
import {addVercelProjectDomain,getVercelDomainStatus,verifyVercelProjectDomain} from "@/lib/vercelDomains";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const target=(slug:string,kind:"success"|"error",message:string)=>`/app/${slug}/settings/website?${kind}=${encodeURIComponent(message)}`;
const urls=(value:string)=>[...new Set(value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean))].slice(0,12);
const reviews=(data:FormData)=>{
 const authors=data.getAll("reviewAuthor").map(String),ratings=data.getAll("reviewRating").map(Number),texts=data.getAll("reviewText").map(value=>String(value).trim());
 return authors.map((author,index)=>({author:author.trim(),rating:ratings[index],text:texts[index]??""})).filter(review=>review.author||review.text).slice(0,6);
};

export async function saveWebsiteSettings(slug:string,data:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))redirect(target(slug,"error","Only owners and administrators can manage the website."));
 const publicSlug=text(data,"publicSlug").toLowerCase(),template=text(data,"template"),primary=text(data,"primaryColor"),secondary=text(data,"secondaryColor"),customDomainRaw=text(data,"customDomain"),customDomain=normalizeWebsiteDomain(customDomainRaw),googleReviewUrl=text(data,"googleReviewUrl"),manualPhotoUrls=urls(text(data,"photoUrls")),googleReviews=reviews(data);
 const photoFiles=data.getAll("websitePhotos").filter((entry):entry is File=>entry instanceof File&&entry.size>0);
 if(!validWebsiteSlug(publicSlug))redirect(target(slug,"error","Use lowercase letters, numbers, and hyphens for the website URL."));
 if(!websiteTemplates.includes(template as typeof websiteTemplates[number]))redirect(target(slug,"error","Choose a valid website template."));
 if(!validWebsiteColor(primary)||!validWebsiteColor(secondary))redirect(target(slug,"error","Choose valid six-digit brand colors."));
 if(customDomainRaw&&!customDomain)redirect(target(slug,"error","Enter a valid domain name."));
 if(googleReviewUrl){try{const url=new URL(googleReviewUrl);if(url.protocol!=="https:")throw new Error();}catch{redirect(target(slug,"error","The Google review link must be a secure HTTPS URL."));}}
 if(googleReviews.some(review=>review.author.length<1||review.author.length>100||review.text.length<3||review.text.length>600||!Number.isInteger(review.rating)||review.rating<1||review.rating>5))redirect(target(slug,"error","Complete each Google review with a customer name, rating, and review text."));
 if(manualPhotoUrls.some(url=>{try{return new URL(url).protocol!=="https:";}catch{return true;}}))redirect(target(slug,"error","Every photo must use a valid HTTPS URL."));
 const allowedPhotoTypes=new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif"]);
 if(photoFiles.length>6)redirect(target(slug,"error","Upload up to 6 website photos at a time."));
 if(photoFiles.some(file=>file.size>8*1024*1024||!allowedPhotoTypes.has(file.type)))redirect(target(slug,"error","Use JPG, PNG, WebP, GIF, or AVIF photos under 8MB each."));
 if(manualPhotoUrls.length+photoFiles.length>12)redirect(target(slug,"error","A website can display up to 12 photos."));
 const {data:existing}=await supabase.from("business_website_settings").select("custom_domain,status").eq("business_id",business.id).maybeSingle();
 const uploadedPaths:string[]=[],uploadedUrls:string[]=[];
 if(photoFiles.length){
  const admin=getSupabaseAdmin();if(!admin)redirect(target(slug,"error","Website photo uploads are not configured."));
  for(const file of photoFiles){
   const extension=file.type==="image/jpeg"?"jpg":file.type.split("/")[1],path=`${business.id}/${crypto.randomUUID()}.${extension}`;
   const {error:uploadError}=await admin.storage.from("website-assets").upload(path,file,{contentType:file.type,upsert:false});
   if(uploadError){if(uploadedPaths.length)await admin.storage.from("website-assets").remove(uploadedPaths);console.error("Website photo upload failed",{businessId:business.id,message:uploadError.message});redirect(target(slug,"error","One or more website photos could not be uploaded. Apply the website-assets migration first."));}
   uploadedPaths.push(path);uploadedUrls.push(admin.storage.from("website-assets").getPublicUrl(path).data.publicUrl);
  }
 }
 const photoUrls=[...new Set([...manualPhotoUrls,...uploadedUrls])].slice(0,12);
 const domainStatus=!customDomain?"not_connected":existing?.custom_domain===customDomain?undefined:"not_connected";
 const {error}=await supabase.from("business_website_settings").upsert({business_id:business.id,public_slug:publicSlug,template_key:template,primary_color:primary,secondary_color:secondary,hero_heading:text(data,"heroHeading")||null,hero_subheading:text(data,"heroSubheading")||null,about_text:text(data,"aboutText")||null,google_review_url:googleReviewUrl||null,google_reviews:googleReviews,photo_urls:photoUrls,request_service_enabled:data.get("requestEnabled")==="on",booking_enabled:data.get("bookingEnabled")==="on",custom_domain:customDomain,...(domainStatus?{domain_status:domainStatus}:{}),updated_by:user.id},{onConflict:"business_id"});
 if(error){const admin=getSupabaseAdmin();if(admin&&uploadedPaths.length)await admin.storage.from("website-assets").remove(uploadedPaths);console.error("Website settings save failed",{businessId:business.id,code:error.code});redirect(target(slug,"error",error.code==="23505"?"That website URL or domain is already in use.":"Website settings could not be saved. Apply the website migration first."));}
 revalidatePath(`/app/${slug}/settings/website`);revalidatePath(`/sites/${publicSlug}`);redirect(target(slug,"success","Website settings saved."));
}

export async function setWebsitePublished(slug:string,data:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))redirect(target(slug,"error","Only owners and administrators can publish the website."));
 const publish=data.get("publish")==="true";
 const {data:settings}=await supabase.from("business_website_settings").select("id,public_slug").eq("business_id",business.id).maybeSingle();
 if(!settings)redirect(target(slug,"error","Save the website settings before publishing."));
 const {error}=await supabase.from("business_website_settings").update({status:publish?"published":"draft",published_at:publish?new Date().toISOString():null,updated_by:user.id}).eq("business_id",business.id).eq("id",settings.id);
 if(error)redirect(target(slug,"error","Website publishing status could not be changed."));
 revalidatePath(`/app/${slug}/settings/website`);revalidatePath(`/sites/${settings.public_slug}`);redirect(target(slug,"success",publish?"Website published.":"Website unpublished. The public URL is no longer available."));
}

export async function connectWebsiteDomain(slug:string,data:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))redirect(target(slug,"error","Only owners and administrators can connect a domain."));
 const domain=normalizeWebsiteDomain(text(data,"customDomain"));
 if(!domain)redirect(target(slug,"error","Enter and save a valid domain name first."));
 const {data:settings}=await supabase.from("business_website_settings").select("id").eq("business_id",business.id).maybeSingle();
 if(!settings)redirect(target(slug,"error","Save the website settings before connecting a domain."));
 const {error:saveError}=await supabase.from("business_website_settings").update({custom_domain:domain,domain_status:"pending_verification",updated_by:user.id}).eq("business_id",business.id).eq("id",settings.id);
 if(saveError)redirect(target(slug,"error",saveError.code==="23505"?"That domain is already connected to another Servonas website.":"The domain could not be saved."));
 try{await addVercelProjectDomain(domain);}catch(error){console.error("Website domain registration failed",{businessId:business.id,domain,error:error instanceof Error?error.message:"unknown"});redirect(target(slug,"error","Servonas could not register this domain with hosting. Check the domain configuration and try again."));}
 revalidatePath(`/app/${slug}/settings/website`);
 redirect(target(slug,"success","Domain added. Update the displayed DNS records, then select Check connection."));
}

export async function checkWebsiteDomain(slug:string,data:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))redirect(target(slug,"error","Only owners and administrators can verify a domain."));
 const domain=normalizeWebsiteDomain(text(data,"customDomain"));
 if(!domain)redirect(target(slug,"error","Enter a valid domain name before checking the connection."));
 let {data:settings}=await supabase.from("business_website_settings").select("id,custom_domain").eq("business_id",business.id).maybeSingle();
 if(!settings){
  const publicSlug=text(data,"publicSlug").toLowerCase();
  if(!validWebsiteSlug(publicSlug))redirect(target(slug,"error","Enter a valid Servonas website URL before connecting the domain."));
  const {data:created,error}=await supabase.from("business_website_settings").insert({business_id:business.id,public_slug:publicSlug,custom_domain:domain,domain_status:"pending_verification",updated_by:user.id}).select("id,custom_domain").single();
  if(error||!created)redirect(target(slug,"error",error?.code==="23505"?"That domain is already connected to another Servonas website.":"The domain could not be saved."));
  settings=created;
 }else if(settings.custom_domain!==domain){
  const {error}=await supabase.from("business_website_settings").update({custom_domain:domain,domain_status:"pending_verification",updated_by:user.id}).eq("business_id",business.id).eq("id",settings.id);
  if(error)redirect(target(slug,"error",error.code==="23505"?"That domain is already connected to another Servonas website.":"The domain could not be saved."));
  settings={...settings,custom_domain:domain};
 }
 let connected=false;
 try{
  await addVercelProjectDomain(domain);
  const before=await getVercelDomainStatus(domain);
  if(!before.verified)try{await verifyVercelProjectDomain(domain);}catch{/* The verification record remains visible for the customer. */}
  const current=await getVercelDomainStatus(domain);connected=current.verified&&!current.misconfigured;
  await supabase.from("business_website_settings").update({custom_domain:domain,domain_status:connected?"connected":"pending_verification",updated_by:user.id}).eq("business_id",business.id).eq("id",settings.id);
 }catch(error){console.error("Website domain verification failed",{businessId:business.id,domain,error:error instanceof Error?error.message:"unknown"});redirect(target(slug,"error","The domain connection could not be checked. Try again shortly."));}
 revalidatePath(`/app/${slug}/settings/website`);
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
