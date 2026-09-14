import {notFound} from "next/navigation";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {BookingLegalPage} from "@/components/BookingLegalPage";
import type {Metadata} from "next";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Privacy Policy"};
export default async function BookingPrivacyPolicy({params}:{params:Promise<{businessSlug:string}>}){const {businessSlug}=await params,supabase=getSupabaseAdmin();if(!supabase)notFound();const {data:settings}=await supabase.from("booking_settings").select("public_slug,businesses(name,website_url,email,phone)").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();if(!settings)notFound();const business=Array.isArray(settings.businesses)?settings.businesses[0]:settings.businesses;return <BookingLegalPage kind="privacy" businessName={business?.name||"This business"} backHref={`/book/${businessSlug}`} privacyHref={`/book/${businessSlug}/privacy`} termsHref={`/book/${businessSlug}/terms`} websiteHref={business?.website_url} email={business?.email} phone={business?.phone}/>;}
