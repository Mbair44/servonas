import "./globals.css";
import Link from "next/link";
import SiteChrome from "@/components/SiteChrome";

export const metadata = {
  title: "Servonas | The Operating System for Service Businesses",
  description: "Run bookings, scheduling, inventory, payments, customer communication, and operations from one flexible platform.",
  keywords: ["service business software", "booking software", "rental management software", "field service platform", "inventory scheduling"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>
    <SiteChrome><header className="sv-header"><div className="sv-container sv-nav">
      <Link className="sv-brand" href="/" aria-label="Servonas home"><img src="/servonas-logo.svg" alt="Servonas" /></Link>
      <nav className="sv-navlinks"><Link href="/features">Features</Link><Link href="/industries">Industries</Link><Link href="/pricing">Pricing</Link><Link href="/demo">Demo</Link><Link href="/contact">Contact</Link><Link href="/login">Log in</Link><Link className="sv-button sv-small" href="/signup">Start Free</Link></nav>
    </div></header></SiteChrome>
    {children}
    <SiteChrome><footer className="sv-footer"><div className="sv-container sv-footer-grid">
      <div><img className="sv-footer-logo" src="/servonas-logo-light.svg" alt="Servonas"/><p>The operating system for modern service businesses.</p></div>
      <div><h3>Product</h3><Link href="/features">Features</Link><Link href="/pricing">Pricing</Link><Link href="/demo">Demo</Link></div>
      <div><h3>Solutions</h3><Link href="/industries">Rentals</Link><Link href="/industries">Appointments</Link><Link href="/industries">Field services</Link></div>
      <div><h3>Company</h3><Link href="/contact">Contact</Link><Link href="/onboarding">Create your business</Link><span>Privacy</span><span>Terms</span></div>
    </div><div className="sv-container sv-footer-bottom">© {new Date().getFullYear()} Servonas. Built for businesses that keep the world moving.</div></footer></SiteChrome>
  </body></html>;
}
