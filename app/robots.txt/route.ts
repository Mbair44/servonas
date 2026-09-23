import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export async function GET(request:Request){
 const url=new URL(request.url),host=url.hostname.toLowerCase(),platformHost=new URL(process.env.NEXT_PUBLIC_APP_URL||"https://servonas.com").hostname.toLowerCase(),db=getSupabaseAdmin();
 const lines=["User-agent: *","Disallow: /app/","Disallow: /api/","Disallow: /manage-booking/","Disallow: /invoice/"];
 if(db&&host!==platformHost&&host!==`www.${platformHost}`){
  const normalized=host.replace(/^www\./,""),{data:website}=await db.from("business_website_settings").select("business_id").or(`custom_domain.ilike.${normalized},custom_domain.ilike.www.${normalized}`).eq("status","published").maybeSingle();
  if(website){lines.push("Disallow: /booking","Disallow: /privacy","Disallow: /terms",`Sitemap: ${url.origin}/sitemap.xml`);return new Response(`${lines.join("\n")}\n`,{headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"public, max-age=300, s-maxage=300"}});}
 }
 lines.push(`Sitemap: ${url.origin}/sitemap.xml`);return new Response(`${lines.join("\n")}\n`,{headers:{"Content-Type":"text/plain; charset=utf-8"}});
}
