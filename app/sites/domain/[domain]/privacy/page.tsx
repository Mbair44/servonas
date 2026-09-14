import {notFound} from "next/navigation";
import {BookingLegalPage} from "@/components/BookingLegalPage";
import {loadPublishedBusinessWebsiteByDomain} from "@/lib/businessWebsite";
import {normalizeWebsiteDomain} from "@/lib/website";
import type {Metadata} from "next";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"Privacy Policy"};
export default async function DomainPrivacy({params}:{params:Promise<{domain:string}>}){const domain=normalizeWebsiteDomain(decodeURIComponent((await params).domain));if(!domain)notFound();const record=await loadPublishedBusinessWebsiteByDomain(domain,"/sites/domain/[domain]/booking");if(record.kind!=="ok")notFound();return <BookingLegalPage kind="privacy" businessName={record.site.name} backHref="/booking" privacyHref="/privacy" termsHref="/terms" email={record.site.email} phone={record.site.phone}/>;}
