import {redirect} from "next/navigation";
import OnboardingWizard from "@/components/OnboardingWizard";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
export default async function Onboarding(){const s=await createSupabaseServerClient();const {data:{user}}=await s.auth.getUser();if(!user)redirect("/login?next=/onboarding");return <main><section className="sv-page-hero sv-compact"><div className="sv-container"><span className="sv-kicker">Create your business</span><h1>Configure your Servonas workspace.</h1><p>Your workspace and owner access are created together—no database work required.</p></div></section><section className="sv-section"><div className="sv-container"><OnboardingWizard defaultEmail={user.email??""}/></div></section></main>}
