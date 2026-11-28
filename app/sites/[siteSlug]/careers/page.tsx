import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {loadPublicCareersTenant,publishedCareers} from "@/lib/publicCareers";
import {PublicCareers} from "@/components/PublicCareers";
import {hostedTenantRobots,publicSeoPlatformUrl,tenantMetadata} from "@/lib/publicTenantSeo";
export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{siteSlug:string}>}):Promise<Metadata>{const {siteSlug}=await params,db=getSupabaseAdmin();if(!db)return{};const tenant=await loadPublicCareersTenant(db,{siteSlug});if(!tenant)return{};return tenantMetadata({settings:{public_slug:siteSlug},fallbackBase:`${publicSeoPlatformUrl}/sites/${siteSlug}`,path:"/careers",title:`Careers | ${tenant.businessName}`,description:`Current job openings at ${tenant.businessName}.`,index:true});}
export default async function Page({params}:{params:Promise<{siteSlug:string}>}){const {siteSlug}=await params,db=getSupabaseAdmin();if(!db)notFound();const tenant=await loadPublicCareersTenant(db,{siteSlug});if(!tenant)notFound();return <PublicCareers tenant={tenant} jobs={await publishedCareers(db,tenant.businessId)}/>;}
