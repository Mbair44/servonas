import {redirect} from "next/navigation";
import OnboardingWizard from "@/components/OnboardingWizard";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import Link from "next/link";
import OnboardingBusinessProfile from "@/components/OnboardingBusinessProfile";
import OnboardingBusinessHours from "@/components/OnboardingBusinessHours";
import OnboardingFirstService from "@/components/OnboardingFirstService";
import OnboardingReadinessReview from "@/components/OnboardingReadinessReview";
export default async function Onboarding({searchParams}:{searchParams:Promise<{business?:string;saved?:string;error?:string}>}){
 const query=await searchParams,s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login?next=/onboarding");
 if(query.business){
  const {data:business,error:businessError}=await s.from("businesses").select("id,name,display_name,slug,timezone,operating_model,industry_profile,onboarding_defaults").eq("slug",query.business).maybeSingle();
  if(businessError){console.error("Onboarding workspace resume lookup failed",{code:businessError.code,businessSlug:query.business,userId:user.id});return <main className="onboarding-resume"><section><span className="sv-kicker">Setup saved</span><h1>Your workspace was created.</h1><p>Servonas could not load the next onboarding step. This is usually caused by an unapplied onboarding migration.</p><div><Link className="sv-button" href="/app">Open your workspaces</Link></div></section></main>;}
  if(!business)return <main className="onboarding-resume"><section><span className="sv-kicker">Workspace unavailable</span><h1>Onboarding could not be resumed.</h1><p>The workspace does not exist or your account cannot access it.</p><div><Link className="sv-button" href="/app">Open your workspaces</Link></div></section></main>;
  if(query.saved==="company")return <main className="onboarding-shell"><OnboardingBusinessProfile businessSlug={business.slug} initialModel={business.operating_model??"appointment_service"} initialIndustry={business.industry_profile??""}/></main>;
  const {data:state,error:stateError}=await s.from("business_onboarding_states").select("status,current_step,completed_steps,last_activity_at").eq("business_id",business.id).maybeSingle();
  if(stateError){console.error("Onboarding state resume failed",{code:stateError.code,businessId:business.id,userId:user.id});return <main className="onboarding-resume"><section><span className="sv-kicker">Setup saved</span><h1>{business.display_name||business.name} was created.</h1><p>The saved onboarding state could not be loaded. Apply the latest Epic 2.1 migration, then retry.</p><div><Link className="sv-button" href="/app">Open workspace</Link></div></section></main>;}
  {
   if((state?.current_step??3)<=3)return <main className="onboarding-shell"><OnboardingBusinessProfile businessSlug={business.slug} initialModel={business.operating_model??"appointment_service"} initialIndustry={business.industry_profile??""}/></main>;
   if(state?.current_step===4){const {data:hours}=await s.from("booking_availability").select("weekday,start_time,end_time,active").eq("business_id",business.id).eq("active",true);const byDay=new Map((hours??[]).map(row=>[row.weekday,row]));const initialHours=Array.from({length:7},(_,weekday)=>{const row=byDay.get(weekday);return {weekday,open:Boolean(row),start:row?.start_time?.slice(0,5)??"09:00",end:row?.end_time?.slice(0,5)??"17:00"}});return <main className="onboarding-shell"><OnboardingBusinessHours businessSlug={business.slug} timezone={(business as typeof business&{timezone?:string}).timezone??"America/Phoenix"} initialHours={initialHours}/></main>;}
   if(state?.current_step===5)return <main className="onboarding-shell"><OnboardingFirstService businessSlug={business.slug} defaults={(business.onboarding_defaults??{}) as {service_name?:string;duration_minutes?:number;recurring_allowed?:boolean}}/></main>;
   if(state?.current_step===6&&state.status!=="completed"){const [{count:hours},{count:services},{data:pilot}]=await Promise.all([
    s.from("booking_availability").select("id",{head:true,count:"exact"}).eq("business_id",business.id).eq("active",true),
    s.from("services").select("id",{head:true,count:"exact"}).eq("business_id",business.id).eq("is_deleted",false),
    s.from("business_entitlements").select("id").eq("business_id",business.id).eq("entitlement_key","pilot").eq("status","active").lte("starts_at",new Date().toISOString()).or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`).maybeSingle(),
   ]);const facts={company:Boolean(business.name&&business.display_name&&business.timezone),businessProfile:Boolean(business.operating_model&&business.industry_profile),businessHours:Boolean(hours),firstService:Boolean(services),pilotAccess:Boolean(pilot)};
    return <main className="onboarding-shell"><OnboardingReadinessReview businessSlug={business.slug} businessName={business.display_name||business.name} facts={facts} error={query.error}/></main>;}
   return <main className="onboarding-resume"><section><span className="sv-kicker">Profile saved</span><h1>{business.display_name||business.name} is taking shape.</h1><p>Your company, business profile, and active Pilot access are saved. You can leave safely and return later.</p><div className="onboarding-resume-status"><strong>50% complete</strong><span>Next: Business hours</span><small>Last saved {state?.last_activity_at?new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(state.last_activity_at)):"just now"}</small></div><p>Business Hours is the next onboarding checkpoint.</p><div><Link className="sv-button" href={`/app/${business.slug}`}>Continue to workspace</Link><Link className="sv-button sv-secondary" href="/app">Resume later</Link></div></section></main>;
  }}
 return <main className="onboarding-shell"><OnboardingWizard defaultEmail={user.email??""} googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY?process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:undefined}/></main>;
}
