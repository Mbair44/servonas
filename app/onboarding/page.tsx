import {redirect} from "next/navigation";
import OnboardingWizard from "@/components/OnboardingWizard";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import Link from "next/link";
import OnboardingBusinessProfile from "@/components/OnboardingBusinessProfile";
import OnboardingBusinessHours from "@/components/OnboardingBusinessHours";
export default async function Onboarding({searchParams}:{searchParams:Promise<{business?:string;saved?:string}>}){
 const query=await searchParams,s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login?next=/onboarding");
 if(query.business){
  const {data:membership}=await s.from("business_members").select("role,businesses!inner(id,name,display_name,slug,timezone,operating_model,industry_profile,onboarding_defaults)").eq("user_id",user.id).eq("businesses.slug",query.business).maybeSingle();
  if(membership){const business=Array.isArray(membership.businesses)?membership.businesses[0]:membership.businesses;const {data:state}=await s.from("business_onboarding_states").select("status,current_step,completed_steps,last_activity_at").eq("business_id",business.id).maybeSingle();
   if((state?.current_step??3)<=3)return <main className="onboarding-shell"><OnboardingBusinessProfile businessSlug={business.slug} initialModel={business.operating_model??"appointment_service"} initialIndustry={business.industry_profile??""}/></main>;
   if(state?.current_step===4){const {data:hours}=await s.from("booking_availability").select("weekday,start_time,end_time,active").eq("business_id",business.id).eq("active",true);const byDay=new Map((hours??[]).map(row=>[row.weekday,row]));const initialHours=Array.from({length:7},(_,weekday)=>{const row=byDay.get(weekday);return {weekday,open:Boolean(row),start:row?.start_time?.slice(0,5)??"09:00",end:row?.end_time?.slice(0,5)??"17:00"}});return <main className="onboarding-shell"><OnboardingBusinessHours businessSlug={business.slug} timezone={(business as typeof business&{timezone?:string}).timezone??"America/Phoenix"} initialHours={initialHours}/></main>;}
   return <main className="onboarding-resume"><section><span className="sv-kicker">Profile saved</span><h1>{business.display_name||business.name} is taking shape.</h1><p>Your company, business profile, and active Pilot access are saved. You can leave safely and return later.</p><div className="onboarding-resume-status"><strong>50% complete</strong><span>Next: Business hours</span><small>Last saved {state?.last_activity_at?new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(state.last_activity_at)):"just now"}</small></div><p>Business Hours is the next onboarding checkpoint.</p><div><Link className="sv-button" href={`/app/${business.slug}`}>Continue to workspace</Link><Link className="sv-button sv-secondary" href="/app">Resume later</Link></div></section></main>;
  }}
 return <main className="onboarding-shell"><OnboardingWizard defaultEmail={user.email??""}/></main>;
}
