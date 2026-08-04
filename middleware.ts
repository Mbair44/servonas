import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function middleware(request:NextRequest){
 const hostname=request.nextUrl.hostname.toLowerCase(),productionHost=(process.env.NEXT_PUBLIC_APP_URL?new URL(process.env.NEXT_PUBLIC_APP_URL).hostname:"servonas.com").toLowerCase();
 const platformHosts=new Set([productionHost,`www.${productionHost}`,"localhost","127.0.0.1",process.env.VERCEL_URL?.toLowerCase()].filter(Boolean));
 if(!platformHosts.has(hostname)&&!hostname.endsWith(".vercel.app")){
  const destination=request.nextUrl.clone();destination.pathname=`/sites/domain/${encodeURIComponent(hostname)}`;
  return NextResponse.rewrite(destination);
 }
 let response=NextResponse.next({request});const path=request.nextUrl.pathname;
 if(!(path.startsWith("/app")||path.startsWith("/tech")||path==="/login"||path==="/signup"))return response;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key) return response;
 const supabase=createServerClient(url,key,{cookies:{getAll:()=>request.cookies.getAll(),setAll:(items: { name: string; value: string; options: CookieOptions }[])=>{items.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});items.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
 const {data:{user}}=await supabase.auth.getUser();
 if((path.startsWith("/app")||path.startsWith("/tech"))&&!user){const login=request.nextUrl.clone();login.pathname="/login";login.searchParams.set("next",path);return NextResponse.redirect(login);}
 if((path==="/login"||path==="/signup")&&user){const app=request.nextUrl.clone();app.pathname="/app";app.search="";return NextResponse.redirect(app);}
 return response;
}
export const config={matcher:["/((?!api/|_next/|favicon.ico|robots.txt|sitemap.xml).*)"]};
