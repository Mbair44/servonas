import Link from "next/link";

type Props={kind:"privacy"|"terms";businessName:string;backHref:string;privacyHref:string;termsHref:string;websiteHref?:string|null;email?:string|null;phone?:string|null};

export function BookingLegalPage({kind,businessName,backHref,privacyHref,termsHref,websiteHref,email,phone}:Props){
 const support=[email,phone].filter(Boolean).join(" or ")||"the business through its normal customer-service channels";
 if(kind==="privacy")return <main className="booking-policy-page"><article>
  <header><small>{businessName}</small><h1>Privacy Policy</h1><p>Last updated September 14, 2026</p></header>
  <section><h2>Information we collect</h2><p>When you request or reserve a rental, we collect the contact, event, payment, and service information you provide. This may include your name, email address, mobile phone number, delivery address, rental selections, event details, payment records, and optional notes.</p></section>
  <section><h2>How information is used</h2><p>Your information is used to process and manage your booking, deliver and set up rentals, provide booking and service updates, process payments, respond to support requests, maintain business records, and improve customer service.</p></section>
  <section><h2>Registered messaging brand</h2><p>{businessName} is the registered brand responsible for this messaging program.</p></section>
  <section><h2>Mobile information and text messaging</h2><p><strong>We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes.</strong></p><p><strong>Mobile information, text messaging originator opt-in data, and consent will not be shared with third parties or affiliates for marketing or promotional purposes.</strong></p><p>If you opt in, you may receive transactional messages about booking confirmations, reminders, delivery or setup updates, scheduling changes, cancellations, and customer support. Message frequency varies. Message and data rates may apply.</p><p>Reply <strong>STOP</strong> to opt out at any time. Reply <strong>HELP</strong> for help. SMS consent is not a condition of purchase.</p></section>
  <section><h2>Cookies, analytics, and payments</h2><p>The website may use necessary cookies and analytics tools to operate the booking experience, understand website activity, and measure advertising where configured. Payment information may be processed by the business&apos;s payment provider; complete card details are not stored on the tenant website.</p></section>
  <section><h2>Service providers</h2><p>Information may be processed by vendors that provide services necessary to operate bookings, payments, deliveries, and communications. These providers may use the information only to perform services on behalf of {businessName}, subject to appropriate confidentiality and data-protection obligations.</p></section>
  <section><h2>Data protection and retention</h2><p>Reasonable safeguards are used to protect personal information. Information is retained only as long as reasonably necessary for service delivery, business records, legal obligations, and dispute resolution.</p></section>
  <section><h2>Contact and your choices</h2><p>You may request access to, correction of, or deletion of your personal information by contacting {businessName}{support.startsWith("the business")?" through its normal customer-service channels":` at ${support}`}.</p></section>
  <footer><Link href={backHref}>← Back to booking</Link><Link href={termsHref}>Terms of Service</Link>{websiteHref&&<a href={websiteHref}>Business website</a>}</footer>
 </article></main>;
 return <main className="booking-policy-page"><article>
  <header><small>{businessName}</small><h1>Terms of Service</h1><p>Last updated September 14, 2026</p></header>
  <section><h2>SMS Terms</h2><p>After opting in, you may receive SMS or MMS messages from {businessName} about bookings, confirmations, reminders, delivery or setup updates, scheduling changes, invoices, and customer support. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not a condition of purchase. Message delivery is subject to your wireless carrier and is not guaranteed.</p></section>
  <section><h2>Contact</h2><p>For assistance, contact {support}.</p></section>
  <section><h2>Privacy</h2><p>Information associated with this messaging program is handled according to the <Link href={privacyHref}>{businessName} Privacy Policy</Link>, including its protections for mobile opt-in data and consent.</p></section>
  <footer><Link href={backHref}>← Back to booking</Link><Link href={privacyHref}>Privacy Policy</Link>{websiteHref&&<a href={websiteHref}>Business website</a>}</footer>
 </article></main>;
}
