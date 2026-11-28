import {notFound} from "next/navigation";
import type {Metadata} from "next";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {loadPublicCareersTenant,publishedCareers} from "@/lib/publicCareers";
import {PublicCareers} from "@/components/PublicCareers";
import {tenantMetadata} from "@/lib/publicTenantSeo";
export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{domain:string}>}):Promise<Metadata>{const {domain}=await params,db=getSupabaseAdmin();if(!db)return{};const tenant=await loadPublicCareersTenant(db,{domain});if(!tenant)return{};return tenantMetadata({settings:{custom_domain:domain,domain_status:"connected"},fallbackBase:`https://${domain}`,path:"/careers",title:`Careers | ${tenant.businessName}`,description:`Current job openings at ${tenant.businessName}.`});}
export default async function Page({params}:{params:Promise<{domain:string}>}){const {domain}=await params,db=getSupabaseAdmin();if(!db)notFound();const tenant=await loadPublicCareersTenant(db,{domain});if(!tenant)notFound();return <PublicCareers tenant={tenant} jobs={await publishedCareers(db,tenant.businessId)}/>;}
