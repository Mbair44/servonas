import Link from "next/link";
import {notFound} from "next/navigation";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export const dynamic="force-dynamic";

export default async function MessagingTerms({params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,supabase=getSupabaseAdmin();
 if(!supabase)notFound();
 const {data:settings}=await supabase.from("booking_settings").select("public_slug,businesses(name,website_url,email,phone)").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();
 if(!settings)notFound();
 const business=Array.isArray(settings.businesses)?settings.businesses[0]:settings.businesses,businessName=business?.name||"This business";
 const support=[business?.email,business?.phone].filter(Boolean).join(" or ")||"the business through its normal customer-service channels";
 return <main className="booking-policy-page"><article>
  <header><small>Text Messaging Terms of Service</small><h1>{businessName}</h1><p>Last updated July 31, 2026</p></header>
  <section><h2>Program description</h2><p>By opting in to the {businessName} text messaging program, you agree to receive transactional SMS or MMS messages related to appointment requests, confirmations, reminders, technician or scheduling updates, cancellations, service follow-up, estimates, invoices, and responses to messages you send to the business.</p></section>
  <section><h2>Consent and message frequency</h2><p>Consent to receive text messages is not a condition of purchasing goods or services. Message frequency varies based on your appointments, service activity, and interactions with {businessName}. Message and data rates may apply.</p></section>
  <section><h2>Opting out</h2><p><strong>You may cancel the SMS service at any time by replying STOP.</strong> After your opt-out request is processed, you will no longer receive automated text messages from this program unless you opt in again. Other service-related communication may continue through non-SMS channels.</p></section>
  <section><h2>Help and customer support</h2><p>Reply <strong>HELP</strong> for assistance. You may also contact {support}.</p></section>
  <section><h2>Delivery and carrier responsibility</h2><p>Wireless carriers are not liable for delayed or undelivered messages. Delivery depends on your wireless service and is not guaranteed. Contact your wireless provider with questions about your text or data plan.</p></section>
  <section><h2>Supported carriers and eligibility</h2><p>You must be the mobile account holder or have authorization from the account holder to enroll a number. Messaging availability may vary by carrier, device, and location.</p></section>
  <section><h2>Changes to these terms</h2><p>{businessName} may update these messaging terms as operational, legal, or carrier requirements change. The updated date shown above identifies the current version.</p></section>
  <section><h2>Privacy</h2><p>Information associated with this messaging program is handled according to the <Link href={`/book/${businessSlug}/privacy`}>{businessName} Privacy Policy</Link>, including its protections for mobile opt-in data and consent.</p></section>
  <footer><Link href={`/book/${businessSlug}`}>← Back to booking</Link><Link href={`/book/${businessSlug}/privacy`}>Privacy Policy</Link>{business?.website_url&&<a href={business.website_url}>Business website</a>}</footer>
 </article></main>;
}
