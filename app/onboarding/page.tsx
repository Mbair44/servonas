import {redirect} from "next/navigation";
import OnboardingWizard from "@/components/OnboardingWizard";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import Link from "next/link";
export default async function Onboarding({searchParams}:{searchParams:Promise<{business?:string;saved?:string}>}){
 const query=await searchParams,s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login?next=/onboarding");
 if(query.business){
  const {data:membership}=await s.from("business_members").select("role,businesses!inner(id,name,display_name,slug)").eq("user_id",user.id).eq("businesses.slug",query.business).maybeSingle();
  if(membership){const business=Array.isArray(membership.businesses)?membership.businesses[0]:membership.businesses;const {data:state}=await s.from("business_onboarding_states").select("status,current_step,completed_steps,last_activity_at").eq("business_id",business.id).maybeSingle();
   return <main className="onboarding-resume"><section><span className="sv-kicker">Company saved</span><h1>{business.display_name||business.name} is underway.</h1><p>Your company information and active Pilot access are saved. You can leave safely and return to this workspace later.</p><div className="onboarding-resume-status"><strong>33% complete</strong><span>Next: Business profile</span><small>Last saved {state?.last_activity_at?new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(state.last_activity_at)):"just now"}</small></div><p>The Business Profile step is the next onboarding checkpoint.</p><div><Link className="sv-button" href={`/app/${business.slug}`}>Continue to workspace</Link><Link className="sv-button sv-secondary" href="/app">Resume later</Link></div></section></main>;
  }}
 return <main className="onboarding-shell"><OnboardingWizard defaultEmail={user.email??""}/></main>;
}
