"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageBusiness} from "@/lib/access";
import {requireWorkspaceCapability} from "@/lib/workspace";
import {normalizeWebsiteDomain,validWebsiteColor,validWebsiteSlug,websiteTemplates} from "@/lib/website";
import {addVercelProjectDomain,getVercelDomainStatus,verifyVercelProjectDomain} from "@/lib/vercelDomains";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {findGoogleBusinessPlace,resolveGoogleBusinessPlaceId} from "@/lib/googleBusinessPlace";
import {normalizeInstagramUrl} from "@/lib/socialLinks";

const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const target=(slug:string,kind:"success"|"error",message:string,step?:string)=>`/app/${slug}/settings/website?${kind}=${encodeURIComponent(message)}${step?`&step=${encodeURIComponent(step)}`:""}`;
const urls=(value:string)=>[...new Set(value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean))].slice(0,12);
const reviews=(data:FormData)=>{
 const authors=data.getAll("reviewAuthor").map(String),ratings=data.getAll("reviewRating").map(Number),texts=data.getAll("reviewText").map(value=>String(value).trim());
 return authors.map((author,index)=>({author:author.trim(),rating:ratings[index],text:texts[index]??""})).filter(review=>review.author||review.text).slice(0,6);
};

export async function prepareWebsitePhotoUpload(slug:string,name:string,type:string,size:number){
 const {business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))throw new Error("Only owners and administrators can upload website photos.");
 const allowed=new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif"]);
 if(!allowed.has(type)||!Number.isFinite(size)||size<=0||size>8*1024*1024)throw new Error("Choose a JPG, PNG, WebP, GIF, or AVIF photo no larger than 8 MB.");
 const admin=getSupabaseAdmin();if(!admin)throw new Error("Website photo uploads are not configured.");
 const extension=type==="image/jpeg"?"jpg":type.split("/")[1],storagePath=`${business.id}/${crypto.randomUUID()}.${extension}`;
 const {data,error}=await admin.storage.from("website-assets").createSignedUploadUrl(storagePath);
 if(error||!data)throw new Error("The photo upload could not be prepared. Please try again.");
 return {bucket:"website-assets",path:storagePath,token:data.token,url:admin.storage.from("website-assets").getPublicUrl(storagePath).data.publicUrl,name:name.slice(0,180)};
}

export async function saveWebsiteSettings(slug:string,data:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))redirect(target(slug,"error","Only owners and administrators can manage the website."));
 const publicSlug=text(data,"publicSlug").toLowerCase(),template=text(data,"template"),primary=text(data,"primaryColor"),secondary=text(data,"secondaryColor"),customDomainRaw=text(data,"customDomain"),customDomain=normalizeWebsiteDomain(customDomainRaw),googleReviewUrl=text(data,"googleReviewUrl"),instagramRaw=text(data,"instagramUrl"),instagramUrl=normalizeInstagramUrl(instagramRaw),requestedGooglePlaceId=text(data,"googlePlaceId"),manualPhotoUrls=urls(text(data,"photoUrls")),googleReviews=reviews(data);
 const photoFiles=data.getAll("websitePhotos").filter((entry):entry is File=>entry instanceof File&&entry.size>0);
 if(!validWebsiteSlug(publicSlug))redirect(target(slug,"error","Use lowercase letters, numbers, and hyphens for the website URL."));
 if(!websiteTemplates.includes(template as typeof websiteTemplates[number]))redirect(target(slug,"error","Choose a valid website template."));
 if(!validWebsiteColor(primary)||!validWebsiteColor(secondary))redirect(target(slug,"error","Choose valid six-digit brand colors."));
 if(customDomainRaw&&!customDomain)redirect(target(slug,"error","Enter a valid domain name."));
 if(googleReviewUrl){try{const url=new URL(googleReviewUrl);if(url.protocol!=="https:")throw new Error();}catch{redirect(target(slug,"error","The Google review link must be a secure HTTPS URL."));}}
 if(instagramRaw&&!instagramUrl)redirect(target(slug,"error","Enter an Instagram username or profile link, such as @yourbusiness."));
 if(googleReviews.some(review=>review.author.length<1||review.author.length>100||review.text.length<3||review.text.length>600||!Number.isInteger(review.rating)||review.rating<1||review.rating>5))redirect(target(slug,"error","Complete each Google review with a customer name, rating, and review text."));
 if(manualPhotoUrls.some(url=>{try{return new URL(url).protocol!=="https:";}catch{return true;}}))redirect(target(slug,"error","Every photo must use a valid HTTPS URL."));
 const allowedPhotoTypes=new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif"]);
 if(photoFiles.length>6)redirect(target(slug,"error","Upload up to 6 website photos at a time."));
 if(photoFiles.some(file=>file.size>8*1024*1024||!allowedPhotoTypes.has(file.type)))redirect(target(slug,"error","Use JPG, PNG, WebP, GIF, or AVIF photos under 8MB each."));
 if(manualPhotoUrls.length+photoFiles.length>12)redirect(target(slug,"error","A website can display up to 12 photos."));
 const [{data:existing},{data:businessAddress}]=await Promise.all([supabase.from("business_website_settings").select("custom_domain,status,google_place_id").eq("business_id",business.id).maybeSingle(),supabase.from("businesses").select("name,address_line1,city,state,postal_code").eq("id",business.id).maybeSingle()]);
 const expectedGoogleBusiness=businessAddress?{name:businessAddress.name,address:[businessAddress.address_line1,businessAddress.city,businessAddress.state,businessAddress.postal_code].filter(Boolean).join(", ")}:null;
 let googlePlace:Awaited<ReturnType<typeof findGoogleBusinessPlace>>|null=null;
 if(requestedGooglePlaceId){if(!expectedGoogleBusiness?.address)redirect(target(slug,"error","Add the complete business address in Servonas before connecting a Google Place ID."));googlePlace=await resolveGoogleBusinessPlaceId(requestedGooglePlaceId,expectedGoogleBusiness);}
 else if(googleReviewUrl&&expectedGoogleBusiness)googlePlace=await findGoogleBusinessPlace(expectedGoogleBusiness);
 if(googlePlace&&!googlePlace.ok){await supabase.from("business_website_settings").update({google_place_id:null,google_place_name:null,google_place_address:null}).eq("business_id",business.id);revalidatePath(`/sites/${publicSlug}`);redirect(target(slug,"error",`Google rating was disconnected: ${googlePlace.error}`));}
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
 const {error}=await supabase.from("business_website_settings").upsert({business_id:business.id,public_slug:publicSlug,template_key:template,primary_color:primary,secondary_color:secondary,hero_heading:text(data,"heroHeading")||null,hero_subheading:text(data,"heroSubheading")||null,about_text:text(data,"aboutText")||null,instagram_url:instagramUrl,google_review_url:googleReviewUrl||null,google_place_id:googlePlace?.ok?googlePlace.placeId:null,google_place_name:googlePlace?.ok?googlePlace.displayName:null,google_place_address:googlePlace?.ok?googlePlace.formattedAddress:null,google_reviews:googleReviews,photo_urls:photoUrls,request_service_enabled:data.get("requestEnabled")==="on",booking_enabled:data.get("bookingEnabled")==="on",custom_domain:customDomain,...(domainStatus?{domain_status:domainStatus}:{}),updated_by:user.id},{onConflict:"business_id"});
 if(error){const admin=getSupabaseAdmin();if(admin&&uploadedPaths.length)await admin.storage.from("website-assets").remove(uploadedPaths);console.error("Website settings save failed",{businessId:business.id,code:error.code});redirect(target(slug,"error",error.code==="23505"?"That website URL or domain is already in use.":"Website settings could not be saved. Apply the website migration first."));}
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
  const now=new Date().toISOString();
  const {error:onboardingError}=await supabase.from("business_website_onboarding_states").update({current_step:"completed",completed_at:now,updated_at:now}).eq("business_id",business.id);
  if(onboardingError)console.error("Website-first completion state update failed",{businessId:business.id,code:onboardingError.code});
 }
 revalidatePath(`/app/${slug}/settings/website`);revalidatePath(`/sites/${settings.public_slug}`);
 if(publish&&websiteFirst)redirect(`/app/${slug}/settings/website/success`);
 redirect(target(slug,"success",publish?"Website published.":"Website unpublished. The public URL is no longer available."));
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
