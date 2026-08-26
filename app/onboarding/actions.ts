"use server";
import {revalidatePath} from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {validateOnboardingCompany,type OnboardingCompanyInput} from "@/lib/onboardingCompany";
import {validateBusinessProfile,type BusinessProfileInput} from "@/lib/onboardingProfile";
import {requireWorkspace,requireWorkspaceCapability} from "@/lib/workspace";
import {canManageBusiness} from "@/lib/access";
import {defaultBusinessHours,validateBusinessHours,type DayHours} from "@/lib/onboardingHours";
import {normalizeSkills,validateOnboardingService,type OnboardingServiceInput} from "@/lib/onboardingService";
import {verifyGooglePlace} from "@/lib/googleAddress";
import {sendBusinessSetupNotification} from "@/lib/communications/businessSetupEmailService";
import {platformBillingEnabled,servonasTrialDays} from "@/lib/platformBilling";
import {stripeClient,stripeConnectBaseUrl} from "@/lib/stripeConnect";
import {getWebsiteFirstConfig} from "@/lib/websiteFirstConfig";
import {normalizeWebsiteDomain} from "@/lib/website";
import {linkAcquisitionSession} from "@/lib/acquisitionFunnel";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {createWebsiteBuilderDraftToken, loadWebsiteBuilderDraftForBusinessSlug, setWebsiteBuilderDraftCookie} from "@/lib/websiteBuilderDraft";

type GuidedOnboardingValues=Partial<OnboardingCompanyInput>&{userName?:string};
export type OnboardingState={error?:string;fieldErrors?:Partial<Record<keyof OnboardingCompanyInput|string,string>>;values?:GuidedOnboardingValues};
const text=(f:FormData,k:string)=>String(f.get(k)??"").trim();
export async function createWorkspace(_:OnboardingState,formData:FormData):Promise<OnboardingState>{
  const s=await createSupabaseServerClient();
  const {data:{user}}=await s.auth.getUser();
  if(!user) redirect("/login?next=/onboarding");
  const name=text(formData,"name"), slug=text(formData,"slug").toLowerCase(), email=text(formData,"email")||user.email||"";
  const businessModel=text(formData,"model")||"services";
  const modules=["booking","customers"];
  if(formData.get("inventory")==="on") modules.push("inventory");
  if(formData.get("staff")==="on") modules.push("team");
  if(formData.get("deposits")==="on") modules.push("payments");
  if(name.length<2||!slug.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)) return {error:"Enter a business name and a valid workspace URL."};
  const {data,error}=await s.rpc("create_business_workspace",{p_name:name,p_slug:slug,p_email:email,p_business_model:businessModel,p_primary_color:text(formData,"color")||"#2563eb",p_enabled_modules:modules});
  if(error) return {error:error.message.includes("duplicate")?"That workspace URL is already taken.":error.message};
  const created=Array.isArray(data)?data[0]:data;
  await sendBusinessSetupNotification({
    businessId:created?.id,
    businessName:name,
    businessSlug:created?.slug??slug,
    businessEmail:email,
    creatorEmail:user.email,
  });
  redirect(`/app/${created?.slug??slug}?created=1`);
}
export async function createGuidedWorkspace(_:OnboardingState,formData:FormData):Promise<OnboardingState>{
 const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login?next=/onboarding");
 const userName=text(formData,"userName");
 const values:OnboardingCompanyInput={name:text(formData,"name"),displayName:text(formData,"displayName"),slug:text(formData,"slug").toLowerCase(),
  addressLine1:text(formData,"addressLine1"),addressLine2:text(formData,"addressLine2"),city:text(formData,"city"),region:text(formData,"region"),
  postalCode:text(formData,"postalCode"),country:text(formData,"country")||"US",phone:text(formData,"phone"),email:text(formData,"email"),
  website:text(formData,"website"),timezone:text(formData,"timezone")};
 const googlePlaceId=text(formData,"googlePlaceId");
 const returnedValues={...values,userName};
 if(userName.length<2||userName.length>100)return {error:"Enter your name to continue.",fieldErrors:{userName:"Enter your full name."},values:returnedValues};
 if(process.env.GOOGLE_MAPS_API_KEY){
  if(!googlePlaceId)return {error:"Choose the business address from Google’s suggestions.",fieldErrors:{addressLine1:"Select a verified Google address."},values:returnedValues};
  const verified=await verifyGooglePlace(googlePlaceId);
  if(!verified)return {error:"The selected Google address could not be verified. Search for it again.",fieldErrors:{addressLine1:"Choose a valid Google suggestion."},values:returnedValues};
  values.addressLine1=verified.streetAddress;values.addressLine2=verified.unit||values.addressLine2;values.city=verified.city;values.region=verified.state;values.postalCode=verified.postalCode;values.country=verified.country;
 }
 const fieldErrors=validateOnboardingCompany(values);
 if(Object.keys(fieldErrors).length)return {error:"Review the highlighted company information.",fieldErrors,values:returnedValues};
 const {error:profileError}=await s.from("profiles").update({full_name:userName}).eq("id",user.id);
 if(profileError){console.error("Onboarding user name save failed",{userId:user.id,code:profileError.code,message:profileError.message});return {error:"Your name could not be saved. Please try again.",values:returnedValues};}
 const {error:authNameError}=await s.auth.updateUser({data:{full_name:userName}});
 if(authNameError)console.warn("Onboarding auth name metadata save failed",{userId:user.id,message:authNameError.message});
 const {data,error}=await s.rpc("create_guided_business_workspace",{p_name:values.name,p_display_name:values.displayName,p_slug:values.slug,
  p_email:values.email,p_phone:values.phone,p_website_url:values.website||null,p_address_line1:values.addressLine1,p_address_line2:values.addressLine2||null,
  p_city:values.city,p_state:values.region,p_postal_code:values.postalCode,p_country:values.country,p_timezone:values.timezone});
 if(error){console.error("Guided workspace creation failed",{provider:"supabase",operation:"create_guided_business_workspace",code:error.code,message:error.message,userId:user.id});
  return {error:error.code==="23505"?"That workspace URL is already taken.":"Your company could not be saved. Please review the information and try again.",values:returnedValues};}
 const created=Array.isArray(data)?data[0]:data;
 await sendBusinessSetupNotification({
  businessId:created?.id,
  businessName:values.displayName||values.name,
  businessSlug:created?.slug??values.slug,
  businessEmail:values.email,
  creatorEmail:user.email,
 });
 redirect(`/onboarding?business=${encodeURIComponent(created?.slug??values.slug)}&saved=company`);
}
export type BusinessProfileState={error?:string;fieldErrors?:ReturnType<typeof validateBusinessProfile>;values?:BusinessProfileInput};
export type WebsiteFirstState={error?:string;values?:Record<string,string>;selectedServices?:string[]};
export async function createWebsiteFirstWorkspace(_:WebsiteFirstState,formData:FormData):Promise<WebsiteFirstState>{
 const s=await createSupabaseServerClient(),{data:{user}}=await s.auth.getUser();
 const source=text(formData,"source"),config=getWebsiteFirstConfig(source),name=text(formData,"name"),slug=text(formData,"slug").toLowerCase(),phone=text(formData,"phone"),email=text(formData,"email")||user?.email||"",city=text(formData,"city"),state=text(formData,"state"),serviceArea=text(formData,"serviceArea"),description=text(formData,"description"),serviceModel=text(formData,"serviceModel"),domainPreference=text(formData,"domainPreference"),domainRaw=text(formData,"domainName"),domainName=normalizeWebsiteDomain(domainRaw),customService=text(formData,"customService"),acquisitionSessionId=text(formData,"acquisitionSessionId"),services=formData.getAll("services").map(String).map(value=>value.trim()).filter(Boolean).flatMap(value=>value.startsWith("Other")&&customService?[customService]:[value]);
 const values={name,slug,phone,email,city,state,serviceArea,description,source,serviceModel,domainPreference,domainName:domainRaw};if(!config||name.length<2||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||phone.replace(/\D/g,"").length<10||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!city||!state||!services.length||!["existing_domain","need_domain"].includes(domainPreference)||!domainName)return{error:!domainName?"Enter a valid domain, such as www.yourbusiness.com.":"Add your business name, contact details, domain choice, location, and at least one service.",values,selectedServices:services};
 const analytics=getSupabaseAdmin();
 const creator=user? s:analytics;
 if(!creator)return{error:"Website setup is temporarily unavailable. Please try again in a moment.",values,selectedServices:services};
 const rpcName=user?"create_website_first_workspace":"create_anonymous_website_first_workspace";
 const {data,error}=await creator.rpc(rpcName,{p_name:name,p_slug:slug,p_email:email,p_phone:phone,p_city:city,p_state:state,p_service_area:serviceArea,p_description:description,p_services:services,p_source:source,p_service_model:serviceModel||null,p_domain_preference:domainPreference,p_domain_name:domainName});
 if(error){console.error("Website-first workspace creation failed",{userId:user?.id??null,code:error.code,rpcName});return{error:error.code==="23505"?"That business or website URL is already in use.":"Your website setup could not be saved. Apply the website-first onboarding migration and try again.",values,selectedServices:services};}
 const created=Array.isArray(data)?data[0]:data;
 if(analytics&&config)try{await linkAcquisitionSession(analytics,{sessionId:acquisitionSessionId,industry:config.source,userId:user?.id,businessId:created?.id,event:"business_created"});await analytics.from("website_acquisition_events").insert({acquisition_session_id:acquisitionSessionId,industry:config.source,user_id:user?.id??null,business_id:created?.id,event_name:"website_builder_step1_completed",event_key:`${acquisitionSessionId}:step1_completed:${created?.id}`,metadata:{domain_path:domainPreference==="need_domain"?"new":"existing",service_count:services.length,service_area_provided:Boolean(serviceArea),anonymous:!user}});}catch{console.warn("Website acquisition analytics could not be recorded");}
 if(domainPreference==="need_domain"){
  const {error:requestError}=await creator.from("business_website_onboarding_states").update({requested_domain:domainName,domain_request_status:"availability_check_needed",domain_requested_at:new Date().toISOString()}).eq("business_id",created.id).eq("source",config.source);
  if(requestError)console.error("Website-first domain request save failed",{businessId:created.id,userId:user?.id??null,code:requestError.code});
 }
 if(!user&&analytics){
  const {token,tokenHash}=createWebsiteBuilderDraftToken();
  const {error:draftError}=await analytics.from("website_builder_drafts").insert({token_hash:tokenHash,business_id:created.id,source:config.source,acquisition_session_id:acquisitionSessionId||null,email,metadata:{domain_path:domainPreference==="need_domain"?"new":"existing"},current_step:"style"});
  if(draftError){console.error("Anonymous website-builder draft creation failed",{businessId:created.id,code:draftError.code,message:draftError.message});return{error:"We couldn't save your website draft. Please try again.",values,selectedServices:services};}
  await setWebsiteBuilderDraftCookie(token);
 }
 if(user)await sendBusinessSetupNotification({
  businessId:created?.id,
  businessName:name,
  businessSlug:created?.slug??slug,
  businessEmail:email,
  creatorEmail:user.email,
 });
 redirect(`/onboarding?business=${encodeURIComponent(created.slug)}&websiteStep=style`);
}
export async function saveWebsiteFirstStyle(slug:string,formData:FormData){
 const template=text(formData,"template"),primary=text(formData,"primaryColor"),secondary=text(formData,"secondaryColor"),tagline=text(formData,"tagline");
 if(!["modern","traditional","bold"].includes(template)||!/^#[0-9a-f]{6}$/i.test(primary)||!/^#[0-9a-f]{6}$/i.test(secondary)||tagline.length>180)redirect(`/onboarding?business=${encodeURIComponent(slug)}&websiteStep=style&error=${encodeURIComponent("Choose valid website style settings.")}`);
 const server=await createSupabaseServerClient();
 const {data:{user}}=await server.auth.getUser();
 let supabase:Awaited<ReturnType<typeof createSupabaseServerClient>>|ReturnType<typeof getSupabaseAdmin>=server;
 let businessId:string|undefined;
 let businessSlug=slug;
 const actingUserId:string|null=user?.id??null;
 if(user){
  const workspace=await requireWorkspaceCapability(slug,"business_onboarding");
  if(!canManageBusiness(workspace.role))redirect("/app");
  supabase=workspace.supabase;
  businessId=workspace.business.id;
  businessSlug=workspace.business.slug;
 }else{
  const admin=getSupabaseAdmin();
  if(!admin)redirect(`/onboarding?business=${encodeURIComponent(slug)}&websiteStep=style&error=${encodeURIComponent("Website style could not be saved right now.")}`);
  const draft=await loadWebsiteBuilderDraftForBusinessSlug(admin,slug);
  if(!draft)redirect(`/onboarding?source=${encodeURIComponent(text(formData,"source")||"")}&error=${encodeURIComponent("Your website draft could not be found. Start again to rebuild it.")}`);
  const {data:business}=await admin.from("businesses").select("id,slug").eq("id",draft.business_id).eq("is_deleted",false).maybeSingle();
  if(!business)redirect(`/onboarding?source=${encodeURIComponent(draft.source)}&error=${encodeURIComponent("Your website draft is no longer available. Start again to rebuild it.")}`);
  supabase=admin;
  businessId=business.id;
  businessSlug=business.slug;
 }
 const logo=formData.get("logo");
 if(logo instanceof File&&logo.size){
  if(logo.size>5*1024*1024||!["image/jpeg","image/png","image/webp"].includes(logo.type))redirect(`/onboarding?business=${encodeURIComponent(slug)}&websiteStep=style&error=${encodeURIComponent("Use a JPG, PNG, or WebP logo under 5MB.")}`);
  const {data:booking}=await supabase.from("booking_settings").select("logo_path,public_slug").eq("business_id",businessId).maybeSingle(),extension=logo.type==="image/png"?"png":logo.type==="image/webp"?"webp":"jpg",path=`${businessId}/website-logo-${crypto.randomUUID()}.${extension}`;
  const {error:uploadError}=await supabase.storage.from("booking-branding").upload(path,logo,{contentType:logo.type,upsert:false});if(uploadError)redirect(`/onboarding?business=${encodeURIComponent(slug)}&websiteStep=style&error=${encodeURIComponent("The logo could not be uploaded.")}`);
  const {error:logoError}=await supabase.from("booking_settings").upsert({business_id:businessId,public_slug:booking?.public_slug??businessSlug,logo_path:path,brand_color:primary,updated_at:new Date().toISOString(),updated_by:actingUserId},{onConflict:"business_id"});if(logoError){await supabase.storage.from("booking-branding").remove([path]);redirect(`/onboarding?business=${encodeURIComponent(slug)}&websiteStep=style&error=${encodeURIComponent("The logo could not be saved.")}`);}if(booking?.logo_path&&booking.logo_path!==path)await supabase.storage.from("booking-branding").remove([booking.logo_path]);
 }
 const {error}=await supabase.from("business_website_settings").update({template_key:template,primary_color:primary,secondary_color:secondary,...(tagline?{hero_subheading:tagline}:{}),updated_by:actingUserId}).eq("business_id",businessId);if(error)redirect(`/onboarding?business=${encodeURIComponent(slug)}&websiteStep=style&error=${encodeURIComponent("Website style could not be saved.")}`);
 const previewReachedAt=new Date().toISOString();
 await supabase.from("business_website_onboarding_states").update({current_step:"preview",tagline:tagline||null,preview_reached_at:previewReachedAt,updated_by:actingUserId,updated_at:previewReachedAt}).eq("business_id",businessId);
 await supabase.from("website_builder_drafts").update({current_step:"preview",updated_at:previewReachedAt}).eq("business_id",businessId).is("claimed_by_user_id",null);
 const analytics=getSupabaseAdmin();if(analytics){const {data:session}=await analytics.from("website_acquisition_sessions").select("id,industry,user_id").eq("business_id",businessId).order("last_seen_at",{ascending:false}).limit(1).maybeSingle();if(session){const rows=["website_builder_style_selected","website_preview_generated"].map(event=>({acquisition_session_id:session.id,industry:session.industry,user_id:session.user_id,business_id:businessId,event_name:event,event_key:`${session.id}:${event}:${businessId}`,metadata:event==="website_builder_style_selected"?{template}:{}}));await analytics.from("website_acquisition_events").insert(rows);}}
 revalidatePath(`/app/${businessSlug}/settings/website/preview`);revalidatePath(`/sites/preview/${businessSlug}`);redirect(`/onboarding?business=${encodeURIComponent(businessSlug)}&websiteStep=preview&celebrate=1&celebrationAt=${encodeURIComponent(previewReachedAt)}`);
}
export async function finishWebsiteFirstOnboarding(slug:string){const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");if(!canManageBusiness(role))redirect("/app");await supabase.from("business_website_onboarding_states").update({current_step:"completed",completed_at:new Date().toISOString(),updated_by:user.id,updated_at:new Date().toISOString()}).eq("business_id",business.id);redirect(`/onboarding?business=${encodeURIComponent(slug)}`);}
export async function saveBusinessProfile(slug:string,_:BusinessProfileState,formData:FormData):Promise<BusinessProfileState>{
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");
 if(!canManageBusiness(role))return {error:"Only owners and administrators can continue company onboarding."};
 const values={operatingModel:text(formData,"operatingModel"),industryProfile:text(formData,"industryProfile"),otherIndustry:text(formData,"otherIndustry")};
 const fieldErrors=validateBusinessProfile(values);if(Object.keys(fieldErrors).length)return {error:"Choose the profile that best describes your business.",fieldErrors,values};
 const {error}=await supabase.rpc("save_onboarding_business_profile",{p_business_id:business.id,p_operating_model:values.operatingModel,p_industry_profile:values.industryProfile,p_industry_other:values.otherIndustry||null});
 if(error){
  console.error("Onboarding business profile save failed",{businessId:business.id,userId:user.id,code:error.code,message:error.message,details:error.details,hint:error.hint});
  const schemaMissing=["42883","42703","PGRST202"].includes(error.code);
  return {error:error.code==="P0002"?"This onboarding session is no longer active.":schemaMissing?"Business profile setup is not installed. Apply the Epic 2.1 Checkpoint 3 migration, then try again.":"The business profile could not be saved.",values};
 }
 redirect(`/onboarding?business=${encodeURIComponent(slug)}&saved=profile`);
}
export type BusinessHoursState={error?:string;dayErrors?:Record<number,string>};
export async function saveBusinessHours(slug:string,_:BusinessHoursState,formData:FormData):Promise<BusinessHoursState>{
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");if(!canManageBusiness(role))return {error:"Only owners and administrators can change business hours."};
 const rows:DayHours[]=defaultBusinessHours().map((row)=>({weekday:row.weekday,open:formData.get(`open_${row.weekday}`)==="on",start:text(formData,`start_${row.weekday}`),end:text(formData,`end_${row.weekday}`)}));
 const validation=validateBusinessHours(rows);if(validation.form||Object.keys(validation.days).length)return {error:validation.form??"Review the highlighted hours.",dayErrors:validation.days};
 const {error}=await supabase.rpc("save_onboarding_business_hours",{p_business_id:business.id,p_hours:rows});
 if(error){console.error("Onboarding business hours save failed",{businessId:business.id,code:error.code,message:error.message});return {error:"Business hours could not be saved."};}
 redirect(`/onboarding?business=${encodeURIComponent(slug)}&saved=hours`);
}
export type FirstServiceState={error?:string;fieldErrors?:ReturnType<typeof validateOnboardingService>;values?:Partial<OnboardingServiceInput>};
export async function createFirstService(slug:string,_:FirstServiceState,formData:FormData):Promise<FirstServiceState>{
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");if(!canManageBusiness(role))return {error:"Only owners and administrators can create the first service."};
 const values:OnboardingServiceInput={name:text(formData,"name"),description:text(formData,"description"),durationMinutes:Number(text(formData,"durationMinutes")),
  price:text(formData,"price"),recurringAllowed:formData.get("recurringAllowed")==="on",requiredSkills:normalizeSkills(text(formData,"requiredSkills")),active:formData.get("active")==="on"};
 const fieldErrors=validateOnboardingService(values);if(Object.keys(fieldErrors).length)return {error:"Review the highlighted service details.",fieldErrors,values};
 const {error}=await supabase.rpc("create_onboarding_first_service",{p_business_id:business.id,p_name:values.name,p_description:values.description||null,
  p_duration_minutes:values.durationMinutes,p_price_amount:values.price?Number(values.price):null,p_recurring_allowed:values.recurringAllowed,p_required_skills:values.requiredSkills,p_active:values.active});
 if(error){console.error("Onboarding first service creation failed",{businessId:business.id,code:error.code,message:error.message});return {error:"The first service could not be created.",values};}
 redirect(`/onboarding?business=${encodeURIComponent(slug)}&saved=service`);
}
export async function completeOnboarding(slug:string){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"business_onboarding");if(!canManageBusiness(role))redirect(`/onboarding?business=${encodeURIComponent(slug)}&error=${encodeURIComponent("Only owners and administrators can complete onboarding.")}`);
 const {error}=await supabase.rpc("complete_guided_onboarding",{p_business_id:business.id});
 if(error){console.error("Guided onboarding completion failed",{businessId:business.id,code:error.code,message:error.message});redirect(`/onboarding?business=${encodeURIComponent(slug)}&error=${encodeURIComponent(error.message||"Readiness could not be verified.")}`);}
 redirect(`/app/${slug}?onboarding=complete`);
}

export async function startServonasSubscription(slug:string,source:"onboarding"|"settings"="onboarding"){
 const {supabase,business,role}=await requireWorkspace(slug);
 const returnPath=source==="settings"?`/app/${slug}/settings`:`/onboarding?business=${encodeURIComponent(slug)}`;
 const withError=(message:string)=>`${returnPath}${returnPath.includes("?")?"&":"?"}error=${encodeURIComponent(message)}`;
 if(!canManageBusiness(role))redirect(withError("Only owners and administrators can manage subscription billing."));
 if(!platformBillingEnabled())redirect(returnPath);
 const priceId=process.env.STRIPE_SERVONAS_PRICE_ID;
 if(!priceId)redirect(withError("Servonas subscription billing is not configured."));
 let destination:string;
 try{
  const stripe=stripeClient(),base=stripeConnectBaseUrl(),trialDays=servonasTrialDays();
  const {data:existing}=await supabase.from("business_platform_subscriptions").select("stripe_customer_id").eq("business_id",business.id).maybeSingle();
  let customerId=existing?.stripe_customer_id??null;
  if(!customerId){
   const customer=await stripe.customers.create({email:business.email||undefined,name:business.display_name||business.name,metadata:{business_id:business.id,platform:"servonas"}});
   customerId=customer.id;
  }
  const session=await stripe.checkout.sessions.create({
   mode:"subscription",customer:customerId,line_items:[{price:priceId,quantity:1}],
   payment_method_collection:"always",
   subscription_data:{trial_period_days:trialDays,metadata:{business_id:business.id,platform:"servonas"}},
   metadata:{business_id:business.id,business_slug:slug,purpose:"servonas_subscription",return_source:source},
   success_url:`${base}/api/stripe/subscription-return?session_id={CHECKOUT_SESSION_ID}`,
   cancel_url:source==="settings"?`${base}/app/${encodeURIComponent(slug)}/settings?error=${encodeURIComponent("Subscription setup was canceled.")}`:`${base}/onboarding?business=${encodeURIComponent(slug)}&billing=1&error=${encodeURIComponent("Subscription setup was canceled. You can skip it and add billing later.")}`,
  });
  const {error}=await supabase.from("business_platform_subscriptions").upsert({
   business_id:business.id,stripe_customer_id:customerId,stripe_checkout_session_id:session.id,status:"checkout_pending",trial_ends_at:new Date(Date.now()+trialDays*86_400_000).toISOString(),
  },{onConflict:"business_id"});
  if(error)throw new Error(`Subscription setup could not be saved (${error.code}).`);
  if(!session.url)throw new Error("Stripe did not return a subscription checkout URL.");
  destination=session.url;
 }catch(error){
  const message=error instanceof Error?error.message:"Subscription checkout could not be started.";
  console.error("Servonas subscription checkout failed",{businessId:business.id,message});
  redirect(withError(message));
 }
 redirect(destination);
}

export async function manageServonasSubscription(slug:string){
 const {supabase,business,role}=await requireWorkspace(slug);
 const returnPath=`/app/${slug}/settings`;
 if(!canManageBusiness(role))redirect(`${returnPath}?error=${encodeURIComponent("Only owners and administrators can manage subscription billing.")}#servonas-subscription`);
 if(!platformBillingEnabled())redirect(returnPath);
 const {data:subscription,error}=await supabase.from("business_platform_subscriptions").select("stripe_customer_id,status").eq("business_id",business.id).maybeSingle();
 if(error||!subscription?.stripe_customer_id)redirect(`${returnPath}?error=${encodeURIComponent("Servonas subscription billing has not been set up yet.")}#servonas-subscription`);
 if(!["trialing","active","past_due","paused"].includes(subscription.status))redirect(`${returnPath}?error=${encodeURIComponent("Complete subscription setup before managing billing.")}#servonas-subscription`);
 let destination:string;
 try{
  const session=await stripeClient().billingPortal.sessions.create({
   customer:subscription.stripe_customer_id,
   return_url:`${stripeConnectBaseUrl()}${returnPath}#servonas-subscription`,
  });
  destination=session.url;
 }catch(error){
  const message=error instanceof Error?error.message:"The Stripe billing portal could not be opened.";
  console.error("Servonas billing portal failed",{businessId:business.id,message});
  redirect(`${returnPath}?error=${encodeURIComponent(message)}#servonas-subscription`);
 }
 redirect(destination);
}

export async function refreshServonasSubscription(slug:string){
 const {supabase,business,role}=await requireWorkspace(slug);
 const returnPath=`/app/${slug}/settings`;
 if(!canManageBusiness(role))redirect(`${returnPath}?error=${encodeURIComponent("Only owners and administrators can refresh subscription billing.")}#servonas-subscription`);
 const {data:record}=await supabase.from("business_platform_subscriptions").select("stripe_customer_id").eq("business_id",business.id).maybeSingle();
 if(!record?.stripe_customer_id)redirect(`${returnPath}?error=${encodeURIComponent("No Stripe billing customer was found.")}#servonas-subscription`);
 try{
  const subscriptions=await stripeClient().subscriptions.list({customer:record.stripe_customer_id,status:"all",limit:20});
  const subscription=subscriptions.data.find(item=>["trialing","active","past_due","paused"].includes(item.status));
  if(!subscription)throw new Error("Stripe does not show a completed subscription. Resume billing setup.");
  const periodEnd=(subscription as typeof subscription&{current_period_end?:number}).current_period_end;
  const {error}=await supabase.from("business_platform_subscriptions").update({
   stripe_subscription_id:subscription.id,stripe_price_id:subscription.items.data[0]?.price.id??null,status:subscription.status,
   trial_ends_at:subscription.trial_end?new Date(subscription.trial_end*1000).toISOString():null,
   current_period_ends_at:periodEnd?new Date(periodEnd*1000).toISOString():null,cancel_at_period_end:subscription.cancel_at_period_end,updated_at:new Date().toISOString(),
  }).eq("business_id",business.id);
  if(error)throw new Error(`Subscription status could not be saved (${error.code}).`);
 }catch(error){
  const message=error instanceof Error?error.message:"Subscription status could not be refreshed.";
  console.error("Servonas subscription refresh failed",{businessId:business.id,message});
  redirect(`${returnPath}?error=${encodeURIComponent(message)}#servonas-subscription`);
 }
 revalidatePath(returnPath);
 redirect(`${returnPath}?success=${encodeURIComponent("Subscription billing status refreshed.")}#servonas-subscription`);
}
