import "./globals.css";
import "./public-estimate.css";
import "./website.css";
import Link from "next/link";
import Script from "next/script";
import { PhoneInputFormatter } from "@/components/PhoneInputFormatter";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {AuthenticatedAccountMenu} from "@/components/AuthenticatedAccountMenu";

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
  const supabase = await createSupabaseServerClient();
  const {data:{user}} = await supabase.auth.getUser();
  const [{data:profile},{data:employee}]=user?await Promise.all([
    supabase.from("profiles").select("full_name,email").eq("id",user.id).maybeSingle(),
    supabase.from("employees").select("preferred_name").eq("auth_user_id",user.id).eq("is_active",true).order("updated_at",{ascending:false}).limit(1).maybeSingle(),
  ]):[{data:null},{data:null}];
  const accountName=employee?.preferred_name?.trim()||profile?.full_name?.trim()||String(user?.user_metadata?.full_name??"").trim()||user?.email?.split("@")[0]||"Account";
  const accountEmail=profile?.email||user?.email||"";
  return <html lang="en"><body>
    <PhoneInputFormatter/>
    <Script
      src="https://www.googletagmanager.com/gtag/js?id=AW-18340749438"
      strategy="afterInteractive"
    />
    <Script id="google-ads-tag" strategy="afterInteractive">
      {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'AW-18340749438');`}
    </Script>
    <header className={`sv-header${user?" sv-header-authenticated":""}`}><div className="sv-container sv-nav">
      {user
        ? <AuthenticatedAccountMenu name={accountName} email={accountEmail}/>
        : <><Link className="sv-brand" href="/" aria-label="Servonas home"><img src="/servonas-logo.svg" alt="Servonas" /></Link>
          <nav className="sv-navlinks"><Link href="/features">Features</Link><Link href="/industries">Industries</Link><Link href="/pricing">Pricing</Link><Link href="/demo">Demo</Link><Link href="/contact">Contact</Link><Link href="/login">Log in</Link><Link className="sv-button sv-small" href="/signup">Start Free</Link></nav></>}
    </div></header>
    {children}
    <footer className="sv-footer"><div className="sv-container sv-footer-grid">
      <div><img className="sv-footer-logo" src="/servonas-logo-light.svg" alt="Servonas"/><p>The operating system for modern service businesses.</p></div>
      <div><h3>Product</h3><Link href="/features">Features</Link><Link href="/pricing">Pricing</Link><Link href="/demo">Demo</Link></div>
      <div><h3>Solutions</h3><Link href="/industries">Rentals</Link><Link href="/industries">Appointments</Link><Link href="/industries">Field services</Link></div>
      <div><h3>Company</h3><Link href="/contact">Contact</Link><Link href="/onboarding">Create your business</Link><span>Privacy</span><span>Terms</span></div>
    </div><div className="sv-container sv-footer-bottom">© {new Date().getFullYear()} Servonas. Built for businesses that keep the world moving.</div></footer>
  </body></html>;
}
