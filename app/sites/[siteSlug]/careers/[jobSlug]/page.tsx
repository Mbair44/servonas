import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {loadPublicCareersTenant,publishedCareers} from "@/lib/publicCareers";
import {PublicCareers} from "@/components/PublicCareers";
import {publicSeoPlatformUrl,tenantMetadata} from "@/lib/publicTenantSeo";
export const dynamic="force-dynamic";
async function load(siteSlug:string,jobSlug:string){const db=getSupabaseAdmin();if(!db)return null;const tenant=await loadPublicCareersTenant(db,{siteSlug});if(!tenant)return null;const job=(await publishedCareers(db,tenant.businessId)).find(row=>row.slug===jobSlug);return job?{tenant,job}:null;}
export async function generateMetadata({params}:{params:Promise<{siteSlug:string;jobSlug:string}>}):Promise<Metadata>{const {siteSlug,jobSlug}=await params,data=await load(siteSlug,jobSlug);if(!data)return{};return tenantMetadata({settings:{public_slug:siteSlug},fallbackBase:`${publicSeoPlatformUrl}/sites/${siteSlug}`,path:`/careers/${jobSlug}`,title:`${data.job.title} | ${data.tenant.businessName}`,description:`Apply for ${data.job.title} at ${data.tenant.businessName}.`});}
export default async function Page({params}:{params:Promise<{siteSlug:string;jobSlug:string}>}){const {siteSlug,jobSlug}=await params,data=await load(siteSlug,jobSlug);if(!data)notFound();const url=`${publicSeoPlatformUrl}/sites/${siteSlug}/careers/${jobSlug}`;return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"JobPosting",title:data.job.title,description:data.job.description,employmentType:data.job.employment_type,url,hiringOrganization:{"@type":"Organization",name:data.tenant.businessName},jobLocationType:data.job.location}).replace(/</g,"\\u003c")}}/><PublicCareers tenant={data.tenant} job={data.job}/></>;}
