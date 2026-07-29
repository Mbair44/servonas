import Link from "next/link";
import {notFound} from "next/navigation";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export const dynamic="force-dynamic";

export default async function BookingPrivacyPolicy({params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,supabase=getSupabaseAdmin();
 if(!supabase)notFound();
 const {data:settings}=await supabase.from("booking_settings")
  .select("public_slug,businesses(name,website_url)")
  .ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();
 if(!settings)notFound();
 const business=Array.isArray(settings.businesses)?settings.businesses[0]:settings.businesses;
 const businessName=business?.name||"This business";

 return <main className="booking-policy-page">
  <article>
   <header><small>Privacy Policy</small><h1>{businessName}</h1><p>Last updated July 29, 2026</p></header>
   <section><h2>Information we collect</h2><p>When you request an appointment, we collect the contact and service information you provide, which may include your name, email address, mobile phone number, service address, appointment details, and optional photos or notes.</p></section>
   <section><h2>How information is used</h2><p>Your information is used to process and manage your appointment, provide service updates, respond to your requests, maintain business records, and improve customer service.</p></section>
   <section><h2>Mobile information and text messaging</h2><p><strong>Mobile phone numbers, text-message opt-in data, and consent will not be shared, sold, rented, or disclosed to third parties or affiliates for marketing or promotional purposes.</strong></p><p>If you opt in, you may receive transactional messages about appointment requests, confirmations, scheduling changes, reminders, cancellations, and service follow-up. Message frequency varies based on your appointments and interactions. Message and data rates may apply.</p><p>Reply <strong>STOP</strong> to unsubscribe from text messages at any time. Reply <strong>HELP</strong> for assistance. Opting out of text messages does not prevent service-related communication through other channels.</p></section>
   <section><h2>Service providers</h2><p>Information may be processed by vendors that provide services necessary to operate appointment scheduling and communications. These providers may use the information only to perform services on behalf of {businessName}, subject to appropriate confidentiality and data-protection obligations.</p></section>
   <section><h2>Data protection and retention</h2><p>Reasonable safeguards are used to protect personal information. Information is retained only as long as reasonably necessary for service delivery, business records, legal obligations, and dispute resolution.</p></section>
   <section><h2>Your choices</h2><p>You may request access to, correction of, or deletion of your personal information by contacting {businessName} through its website or normal business contact channels.</p></section>
   <footer><Link href={`/book/${businessSlug}`}>← Back to booking</Link>{business?.website_url&&<a href={business.website_url}>Business website</a>}</footer>
  </article>
 </main>;
}
