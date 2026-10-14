import Link from "next/link";
import {notFound} from "next/navigation";
import {loadPublishedBusinessWebsiteByDomain} from "@/lib/businessWebsite";
import {normalizeWebsiteDomain} from "@/lib/website";

export const dynamic="force-dynamic";

export default async function TenantDomainCancelPage({params}:{params:Promise<{domain:string}>}){
 const domain=normalizeWebsiteDomain(decodeURIComponent((await params).domain));
 if(!domain)notFound();
 const record=await loadPublishedBusinessWebsiteByDomain(domain,"/sites/domain/[domain]/cancel");
 if(record.kind!=="ok")notFound();
 return <main className="section alt"><div className="container"><div className="form-card" style={{maxWidth:640,margin:"0 auto",textAlign:"center"}}><span className="eyebrow">Checkout canceled</span><h1>Your reservation has not been paid.</h1><p className="lead">Your selected rentals are still available to review.</p><Link className="button" href="/booking">Return to booking</Link></div></div></main>;
}
