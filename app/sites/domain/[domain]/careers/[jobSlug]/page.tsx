import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {loadPublicCareersTenant,publishedCareers} from "@/lib/publicCareers";
import {PublicCareers} from "@/components/PublicCareers";
import {tenantMetadata} from "@/lib/publicTenantSeo";
export const dynamic="force-dynamic";
async function load(domain:string,jobSlug:string){const db=getSupabaseAdmin();if(!db)return null;const tenant=await loadPublicCareersTenant(db,{domain});if(!tenant)return null;const job=(await publishedCareers(db,tenant.businessId)).find(row=>row.slug===jobSlug);return job?{tenant,job}:null;}
export async function generateMetadata({params}:{params:Promise<{domain:string;jobSlug:string}>}):Promise<Metadata>{const {domain,jobSlug}=await params,data=await load(domain,jobSlug);if(!data)return{};return tenantMetadata({settings:{custom_domain:domain,domain_status:"connected"},fallbackBase:`https://${domain}`,path:`/careers/${jobSlug}`,title:`${data.job.title} | ${data.tenant.businessName}`,description:`Apply for ${data.job.title} at ${data.tenant.businessName}.`});}
export default async function Page({params}:{params:Promise<{domain:string;jobSlug:string}>}){const {domain,jobSlug}=await params,data=await load(domain,jobSlug);if(!data)notFound();const url=`https://${domain}/careers/${jobSlug}`;return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"JobPosting",title:data.job.title,description:data.job.description,employmentType:data.job.employment_type,url,hiringOrganization:{"@type":"Organization",name:data.tenant.businessName},jobLocationType:data.job.location}).replace(/</g,"\\u003c")}}/><PublicCareers tenant={data.tenant} job={data.job}/></>;}
