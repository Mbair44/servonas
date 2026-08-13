import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {getWebsiteFirstConfig} from "@/lib/websiteFirstConfig";
export async function GET(request: Request) {
  const url=new URL(request.url); const code=url.searchParams.get("code"); const requestedNext=url.searchParams.get("next") || "/app",safeNext=requestedNext.startsWith("/")&&!requestedNext.startsWith("//")?requestedNext:"/app";
  if(code){ const s=await createSupabaseServerClient(); const {error}=await s.auth.exchangeCodeForSession(code); if(!error){const {data:{user}}=await s.auth.getUser(),source=getWebsiteFirstConfig(user?.user_metadata?.acquisition_source);const destination=source&&(safeNext==="/app"||safeNext==="/onboarding")?`/onboarding?source=${source.source}`:safeNext;return NextResponse.redirect(new URL(destination, url.origin));} }
  return NextResponse.redirect(new URL("/login?error=Unable%20to%20verify%20your%20account",url.origin));
}
