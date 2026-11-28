import type {SupabaseClient} from "@supabase/supabase-js";

export type PublicCareer={id:string;slug:string;title:string;location:string;employment_type:string;compensation_text:string|null;description:string;qualifications:string};
export type PublicCareersTenant={businessId:string;businessName:string;primaryColor:string;secondaryColor:string;careersEnabled:boolean;showHeader:boolean;showFooter:boolean;siteSlug:string;customDomain:string|null};

export async function loadPublicCareersTenant(db:SupabaseClient,input:{siteSlug?:string;domain?:string}){
 const websiteQuery=input.domain?db.from("business_website_settings").select("business_id,public_slug,custom_domain,domain_status,primary_color,secondary_color,status").or(`custom_domain.ilike.${input.domain},custom_domain.ilike.www.${input.domain}`).eq("status","published").maybeSingle():db.from("business_website_settings").select("business_id,public_slug,custom_domain,domain_status,primary_color,secondary_color,status").ilike("public_slug",input.siteSlug!).eq("status","published").maybeSingle();
 const {data:website}=await websiteQuery;if(!website)return null;
 const [{data:settings},{data:business}]=await Promise.all([db.from("business_recruiting_settings").select("careers_enabled,show_careers_nav_link,show_careers_footer_link").eq("business_id",website.business_id).maybeSingle(),db.from("businesses").select("name,primary_color").eq("id",website.business_id).maybeSingle()]);
 if(!settings?.careers_enabled||!business)return null;
 return {businessId:website.business_id,businessName:business.name,primaryColor:website.primary_color??business.primary_color??"#1769f5",secondaryColor:website.secondary_color??"#0b1733",careersEnabled:true,showHeader:settings.show_careers_nav_link===true,showFooter:settings.show_careers_footer_link===true,siteSlug:website.public_slug,customDomain:website.domain_status==="connected"?website.custom_domain:null} satisfies PublicCareersTenant;
}

export async function publishedCareers(db:SupabaseClient,businessId:string){const {data}=await db.from("job_postings").select("id,slug,title,location,employment_type,compensation_text,description,qualifications").eq("business_id",businessId).eq("status","published").order("published_at",{ascending:false});return(data??[]) as PublicCareer[];}
export const careerLabel=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,char=>char.toUpperCase());
