import {notFound} from "next/navigation";
import {StripeCheckoutSuccess} from "@/components/StripeCheckoutSuccess";
import {loadPublishedBusinessWebsiteByDomain} from "@/lib/businessWebsite";
import {normalizeWebsiteDomain} from "@/lib/website";

export const dynamic="force-dynamic";

export default async function TenantDomainSuccessPage({params,searchParams}:{params:Promise<{domain:string}>;searchParams:Promise<{session_id?:string}>}){
 const domain=normalizeWebsiteDomain(decodeURIComponent((await params).domain));
 if(!domain)notFound();
 const record=await loadPublishedBusinessWebsiteByDomain(domain,"/sites/domain/[domain]/success");
 if(record.kind!=="ok")notFound();
 return <StripeCheckoutSuccess sessionId={(await searchParams).session_id} expectedBusinessId={record.settings.business_id} includeTenantGoogleTag={false} calendarHref="/booking"/>;
}
