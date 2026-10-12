import {loadPublishedBusinessWebsiteByDomain} from "@/lib/businessWebsite";
import {normalizeGoogleAdsTagId} from "@/lib/googleTag";
import {TenantGoogleAdsTag} from "@/components/TenantGoogleAdsTag";

export default async function TenantDomainLayout({params,children}:{params:Promise<{domain:string}>;children:React.ReactNode}){
 const {domain}=await params,record=await loadPublishedBusinessWebsiteByDomain(domain);
 return <>{record.kind==="ok"&&<TenantGoogleAdsTag tagId={normalizeGoogleAdsTagId(record.settings.google_ads_tag_id)} scope={record.settings.business_id}/>} {children}</>;
}
