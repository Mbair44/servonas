import "./globals.css";
import "./public-estimate.css";
import "./website.css";
import Link from "next/link";
import {cookies,headers} from "next/headers";
import { PhoneInputFormatter } from "@/components/PhoneInputFormatter";
import { createSupabaseServerClient, hasSupabaseAuthCookies } from "@/lib/supabaseServer";
import {AuthenticatedAccountMenu} from "@/components/AuthenticatedAccountMenu";
import {AssistantPopover} from "@/components/AssistantPopover";
import {MarketingAnalytics} from "@/components/MarketingAnalytics";
import {ConsentAwareGoogleTag} from "@/components/ConsentAwareGoogleTag";
import {HeaderSignupLink} from "@/components/HeaderSignupLink";

export const metadata = {
  title: "Servonas | The Operating System for Service Businesses",
  description: "Run customers, recurring service plans, scheduling, dispatch, technicians, online booking, invoices, and payments from one field-service platform.",
  keywords: ["field service management software", "service business software", "route optimization", "dispatch software", "recurring service software", "online booking"],
  icons: {
    icon: [{url: "/icon.svg", type: "image/svg+xml"}],
    shortcut: "/icon.svg",
    apple: [{url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png"}],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore=await cookies();
  const requestHeaders=await headers();
  const barePublicShell=requestHeaders.get("x-servonas-public-shell")==="bare";
  let user:null|{id:string;email?:string|null;user_metadata?:Record<string,unknown>}=null;
  let profile:{full_name?:string|null;email?:string|null}|null=null;
  let employee:{preferred_name?:string|null}|null=null;
  if(hasSupabaseAuthCookies(cookieStore)){
    try{
      const supabase = await createSupabaseServerClient();
      const authResult = await supabase.auth.getUser();
      user = authResult.data.user;
      if(user){
        const [profileResult,employeeResult]=await Promise.all([
          supabase.from("profiles").select("full_name,email").eq("id",user.id).maybeSingle(),
          supabase.from("employees").select("preferred_name").eq("auth_user_id",user.id).eq("is_active",true).order("updated_at",{ascending:false}).limit(1).maybeSingle(),
        ]);
        profile=profileResult.data;
        employee=employeeResult.data;
      }
    }catch(error){
      console.warn("Root layout auth lookup skipped",{message:error instanceof Error?error.message:String(error)});
    }
  }
  const accountName=employee?.preferred_name?.trim()||profile?.full_name?.trim()||String(user?.user_metadata?.full_name??"").trim()||user?.email?.split("@")[0]||"Account";
  const accountEmail=profile?.email||user?.email||"";
  return <html lang="en"><body>
    <PhoneInputFormatter/>
    <MarketingAnalytics/>
    <ConsentAwareGoogleTag/>
    {!barePublicShell&&<header className={`sv-header${user?" sv-header-authenticated":""}`}><div className="sv-container sv-nav">
      {user
        ? <div className="authenticated-ribbon-actions"><AssistantPopover/><AuthenticatedAccountMenu name={accountName} email={accountEmail}/></div>
        : <><Link className="sv-brand" href="/" aria-label="Servonas home"><img src="/servonas-logo.svg" alt="Servonas" /></Link>
          <nav className="sv-navlinks"><Link href="/features">Features</Link><Link href="/industries">Industries</Link><Link href="/pricing">Pricing</Link><Link href="/demo">Demo</Link><Link href="/contact">Contact</Link><Link className="sv-mobile-login" href="/login">Log in</Link><HeaderSignupLink/></nav></>}
    </div></header>}
    {children}
    <footer className="sv-footer"><div className="sv-container sv-footer-grid">
      <div><img className="sv-footer-logo" src="/servonas-logo-light.svg" alt="Servonas"/><p>The operating system for modern service businesses.</p></div>
      <div><h3>Product</h3><Link href="/features">Features</Link><Link href="/pricing">Pricing</Link><Link href="/demo">Demo</Link></div>
      <div><h3>Solutions</h3><Link href="/industries">Rentals</Link><Link href="/industries">Appointments</Link><Link href="/industries">Field services</Link></div>
      <div><h3>Company</h3><Link href="/contact">Contact</Link><Link href="/onboarding">Create your business</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
    </div><div className="sv-container sv-footer-bottom">© {new Date().getFullYear()} Servonas. Built for businesses that keep the world moving.</div></footer>
  </body></html>;
}
