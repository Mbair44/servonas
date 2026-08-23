import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isBlockedCustomDomainProbePath } from "@/lib/customDomainProbePaths";

const publicMetadataPaths=new Set(["/favicon.ico","/apple-touch-icon.png","/icon.svg","/manifest.json","/manifest.webmanifest","/robots.txt","/sitemap.xml"]);
const publicAssetExtension=/\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|json|map|png|svg|ttf|webmanifest|webp|woff2?)$/i;

export async function middleware(request:NextRequest){
 const path=request.nextUrl.pathname;
 // Static files and browser metadata must never trigger tenant routing or an
 // authentication lookup. This is intentionally evaluated before hostname
 // handling so custom-domain icons and images are served as files too.
 if(path.startsWith("/_next/")||publicMetadataPaths.has(path)||publicAssetExtension.test(path))return NextResponse.next();
 const hostname=request.nextUrl.hostname.toLowerCase(),productionHost=(process.env.NEXT_PUBLIC_APP_URL?new URL(process.env.NEXT_PUBLIC_APP_URL).hostname:"servonas.com").toLowerCase();
 const platformHosts=new Set([productionHost,`www.${productionHost}`,"localhost","127.0.0.1",process.env.VERCEL_URL?.toLowerCase()].filter(Boolean));
 if(!platformHosts.has(hostname)&&!hostname.endsWith(".vercel.app")){
  if(isBlockedCustomDomainProbePath(path)){
   console.info("Blocked custom-domain probe path",{hostname,path});
   return new NextResponse(null,{status:404});
  }
  const destination=request.nextUrl.clone();
  destination.pathname=
   path==="/mechanical-bull-rental"
    ?`/sites/domain/${encodeURIComponent(hostname)}/mechanical-bull-rental`
    :path==="/booking"
     ?`/sites/domain/${encodeURIComponent(hostname)}/booking`
     :path==="/booking/checkout"
      ?`/sites/domain/${encodeURIComponent(hostname)}/booking/checkout`
      :`/sites/domain/${encodeURIComponent(hostname)}`;
  return NextResponse.rewrite(destination);
 }
 let response=NextResponse.next({request});
 if(!(path.startsWith("/app")||path.startsWith("/tech")||path==="/login"||path==="/signup"))return response;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key) return response;
 const supabase=createServerClient(url,key,{cookies:{getAll:()=>request.cookies.getAll(),setAll:(items: { name: string; value: string; options: CookieOptions }[])=>{items.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});items.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
 const {data:{user}}=await supabase.auth.getUser();
 if((path.startsWith("/app")||path.startsWith("/tech"))&&!user){const login=request.nextUrl.clone();login.pathname="/login";login.searchParams.set("next",path);return NextResponse.redirect(login);}
 if((path==="/login"||path==="/signup")&&user){const app=request.nextUrl.clone();app.pathname="/app";app.search="";return NextResponse.redirect(app);}
 return response;
}
export const config={matcher:["/((?!api(?:/|$)|_next(?:/|$)|favicon\\.ico$|apple-touch-icon\\.png$|icon\\.svg$|manifest(?:\\.json|\\.webmanifest)$|robots\\.txt$|sitemap\\.xml$|.*\\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|json|map|png|svg|ttf|webmanifest|webp|woff2?)$).*)"]};
