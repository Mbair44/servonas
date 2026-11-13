import type {Metadata} from "next";
import type {SupabaseClient} from "@supabase/supabase-js";

const platformUrl=(process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||"https://servonas.com").replace(/\/$/,"");

export type TenantSeoSettings={custom_domain?:string|null;domain_status?:string|null;public_slug?:string|null;google_site_verification_token?:string|null};
const googleSiteVerificationToken=(value:unknown)=>{
 if(typeof value!=="string")return undefined;
 const token=value.trim();
 return /^[A-Za-z0-9_-]{8,256}$/.test(token)?token:undefined;
};

export function tenantCanonicalBase(settings:TenantSeoSettings,fallback:string){
 const domain=settings.domain_status==="connected"&&settings.custom_domain?.trim().toLowerCase();
 return domain?`https://${domain.replace(/^https?:\/\//,"").replace(/\/$/,"")}`:fallback.replace(/\/$/,"");
}

export function tenantCanonicalUrl(settings:TenantSeoSettings,path:string,fallback:string){
 return `${tenantCanonicalBase(settings,fallback)}${path==="/"?"":path.startsWith("/")?path:`/${path}`}`;
}

export function hostedTenantRobots(settings:TenantSeoSettings){
 return settings.domain_status==="connected"&&Boolean(settings.custom_domain)?{index:false,follow:true}:{index:true,follow:true};
}

export function tenantMetadata(input:{settings:TenantSeoSettings;fallbackBase:string;path:string;title:string;description?:string|null;index?:boolean;openGraphTitle?:string|null;openGraphDescription?:string|null}):Metadata{
 const canonical=tenantCanonicalUrl(input.settings,input.path,input.fallbackBase),index=input.index??true;
 const google=googleSiteVerificationToken(input.settings.google_site_verification_token);
 return {title:input.title,description:input.description??undefined,keywords:[],alternates:{canonical},openGraph:{title:input.openGraphTitle??input.title,description:input.openGraphDescription??input.description??undefined,url:canonical,type:"website"},robots:{index,follow:true},...(google?{verification:{google}}:{})};
}

export async function loadTenantSeoByPublicSlug(db:SupabaseClient,publicSlug:string){
 const {data}=await db.from("business_website_settings").select("business_id,public_slug,custom_domain,domain_status,google_site_verification_token").ilike("public_slug",publicSlug).eq("status","published").maybeSingle();
 return data as (TenantSeoSettings&{business_id:string})|null;
}

export const publicSeoPlatformUrl=platformUrl;
