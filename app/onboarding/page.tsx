import {redirect} from "next/navigation";
import OnboardingWizard from "@/components/OnboardingWizard";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import Link from "next/link";
import OnboardingBusinessProfile from "@/components/OnboardingBusinessProfile";
import OnboardingBusinessHours from "@/components/OnboardingBusinessHours";
import OnboardingFirstService from "@/components/OnboardingFirstService";
import OnboardingReadinessReview from "@/components/OnboardingReadinessReview";
import {getCapabilityAccess} from "@/lib/entitlements/service";
import {WebsiteFirstBusiness} from "@/components/WebsiteFirstOnboarding";
import {WebsiteFirstStyle} from "@/components/WebsiteFirstStyle";
import {WebsiteFirstPreview} from "@/components/WebsiteFirstPreview";
import {getWebsiteFirstConfig} from "@/lib/websiteFirstConfig";
import {getVercelDomainStatus} from "@/lib/vercelDomains";
export default async function Onboarding({searchParams}:{searchParams:Promise<{business?:string;saved?:string;error?:string;success?:string;billing?:string;billingAdded?:string;source?:string;websiteStep?:string;websiteMode?:string;domainChoice?:string;domainStage?:string;celebrate?:string;celebrationAt?:string}>}){
 const query=await searchParams,s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login?next=/onboarding");
 if(query.business){
  const {data:business,error:businessError}=await s.from("businesses").select("id,name,display_name,slug,timezone").eq("slug",query.business).eq("is_deleted",false).maybeSingle();
  if(businessError){console.error("Onboarding workspace resume lookup failed",{code:businessError.code,message:businessError.message,details:businessError.details,hint:businessError.hint,businessSlug:query.business,userId:user.id});return <main className="onboarding-resume"><section><span className="sv-kicker">Setup saved</span><h1>Your workspace was created.</h1><p>Servonas could not load the workspace membership needed for onboarding. Open your workspaces and retry setup.</p><div><Link className="sv-button" href="/app">Open your workspaces</Link></div></section></main>;}
  if(!business)return <main className="onboarding-resume"><section><span className="sv-kicker">Workspace unavailable</span><h1>Onboarding could not be resumed.</h1><p>The workspace does not exist or your account cannot access it.</p><div><Link className="sv-button" href="/app">Open your workspaces</Link></div></section></main>;
  const {data:websiteFirst}=await s.from("business_website_onboarding_states").select("source,current_step,preview_reached_at,domain_preference,requested_domain,domain_request_status").eq("business_id",business.id).maybeSingle(),websiteConfig=getWebsiteFirstConfig(websiteFirst?.source);
  if(websiteFirst&&websiteConfig&&(websiteFirst.current_step!=="completed"||query.websiteMode==="live")){
   const step=query.websiteStep||websiteFirst.current_step;
   if(step==="preview"){
    const [{data:website},{data:domainOrder}]=await Promise.all([
     s.from("business_website_settings").select("template_key,primary_color,secondary_color,hero_heading,hero_subheading,public_slug,status,custom_domain,domain_status").eq("business_id",business.id).maybeSingle(),
     websiteFirst.requested_domain?s.from("website_domain_orders").select("status,customer_purchase_price,customer_renewal_price,currency,provider_order_id,availability_checked_at,last_error_category").eq("business_id",business.id).eq("domain_name",websiteFirst.requested_domain).maybeSingle():Promise.resolve({data:null}),
    ]);
    const domainInfo=website?.custom_domain?await getVercelDomainStatus(website.custom_domain).catch(()=>null):null;
    return <main className="onboarding-shell website-first-onboarding"><WebsiteFirstPreview businessId={business.id} businessSlug={business.slug} source={websiteConfig.source} celebrate={query.celebrate==="1"} celebrationAt={query.celebrationAt??websiteFirst.preview_reached_at??undefined} mode={query.websiteMode==="domain"||query.websiteMode==="live"?query.websiteMode:"preview"} domainChoice={query.domainChoice==="existing_domain"||query.domainChoice==="servonas"?query.domainChoice:"need_domain"} domainStage={query.domainStage==="details"||query.domainStage==="registered"?query.domainStage:"search"} error={query.error} success={query.success} website={website??null} websiteFirst={websiteFirst} domainOrder={domainOrder??null} domainInfo={domainInfo} user={{email:user.email??undefined,user_metadata:user.user_metadata as Record<string,unknown>|undefined}} business={business}/></main>;
   }
   return <main className="onboarding-shell website-first-onboarding"><WebsiteFirstStyle businessSlug={business.slug} error={query.error} source={websiteConfig.source}/></main>;
  }
  if(query.saved==="company")return <main className="onboarding-shell"><OnboardingBusinessProfile businessSlug={business.slug} initialModel="appointment_service" initialIndustry=""/></main>;
  const {data:profile,error:profileError}=await s.from("businesses").select("operating_model,industry_profile,onboarding_defaults").eq("id",business.id).maybeSingle();
  if(profileError)console.error("Onboarding profile fields lookup failed",{code:profileError.code,message:profileError.message,details:profileError.details,hint:profileError.hint,businessId:business.id,userId:user.id});
  const operatingModel=profile?.operating_model??"appointment_service",industryProfile=profile?.industry_profile??"",onboardingDefaults=profile?.onboarding_defaults??{};
  const {data:state,error:stateError}=await s.from("business_onboarding_states").select("status,current_step,completed_steps,last_activity_at").eq("business_id",business.id).maybeSingle();
  if(stateError){console.error("Onboarding state resume failed",{code:stateError.code,businessId:business.id,userId:user.id});return <main className="onboarding-resume"><section><span className="sv-kicker">Setup saved</span><h1>{business.display_name||business.name} was created.</h1><p>The saved onboarding state could not be loaded. Apply the latest Epic 2.1 migration, then retry.</p><div><Link className="sv-button" href="/app">Open workspace</Link></div></section></main>;}
  {
   if((state?.current_step??3)<=3)return <main className="onboarding-shell"><OnboardingBusinessProfile businessSlug={business.slug} initialModel={operatingModel} initialIndustry={industryProfile}/></main>;
   if(state?.current_step===4){const {data:hours}=await s.from("booking_availability").select("weekday,start_time,end_time,active").eq("business_id",business.id).eq("active",true);const byDay=new Map((hours??[]).map(row=>[row.weekday,row]));const initialHours=hours?.length?Array.from({length:7},(_,weekday)=>{const row=byDay.get(weekday);return {weekday,open:Boolean(row),start:row?.start_time?.slice(0,5)??"09:00",end:row?.end_time?.slice(0,5)??"17:00"}}):undefined;return <main className="onboarding-shell"><OnboardingBusinessHours businessSlug={business.slug} timezone={(business as typeof business&{timezone?:string}).timezone??"America/Phoenix"} initialHours={initialHours}/></main>;}
   if(state?.current_step===5)return <main className="onboarding-shell"><OnboardingFirstService businessSlug={business.slug} defaults={onboardingDefaults as {service_name?:string;duration_minutes?:number;recurring_allowed?:boolean}}/></main>;
   if(state?.current_step===6&&state.status!=="completed"){const [{count:hours},{count:services},pilotAccess,{data:teamStatus}]=await Promise.all([
    s.from("booking_availability").select("id",{head:true,count:"exact"}).eq("business_id",business.id).eq("active",true),
    s.from("services").select("id",{head:true,count:"exact"}).eq("business_id",business.id).eq("is_deleted",false),
    getCapabilityAccess(s,business.id,"business_onboarding"),
    s.rpc("business_team_onboarding_status",{p_business_id:business.id}),
   ]);const facts={company:Boolean(business.name&&business.display_name&&business.timezone),businessProfile:Boolean(profile?.operating_model&&profile?.industry_profile),businessHours:Boolean(hours),firstService:Boolean(services),pilotAccess:pilotAccess.allowed};
    return <main className="onboarding-shell"><OnboardingReadinessReview businessSlug={business.slug} businessName={business.display_name||business.name} facts={facts} teamStatus={teamStatus??"not_started"} error={query.error}/></main>;}
   return <main className="onboarding-resume"><section><span className="sv-kicker">Profile saved</span><h1>{business.display_name||business.name} is taking shape.</h1><p>Your company and business profile are saved. You can leave safely and return later.</p><div className="onboarding-resume-status"><strong>50% complete</strong><span>Next: Business hours</span><small>Last saved {state?.last_activity_at?new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(state.last_activity_at)):"just now"}</small></div><p>Business Hours is the next onboarding checkpoint.</p><div><Link className="sv-button" href={`/app/${business.slug}`}>Continue to workspace</Link><Link className="sv-button sv-secondary" href="/app">Resume later</Link></div></section></main>;
  }}
 const {data:userProfile}=await s.from("profiles").select("full_name").eq("id",user.id).maybeSingle();
 const defaultUserName=userProfile?.full_name?.trim()||String(user.user_metadata?.full_name??"").trim();
 const websiteSource=getWebsiteFirstConfig(query.source)||getWebsiteFirstConfig(user.user_metadata?.acquisition_source);
 if(websiteSource)return <main className="onboarding-shell website-first-onboarding"><WebsiteFirstBusiness defaultEmail={user.email??""} source={websiteSource.source}/></main>;
 return <main className="onboarding-shell"><OnboardingWizard defaultEmail={user.email??""} defaultUserName={defaultUserName} googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY?process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:undefined}/></main>;
}
