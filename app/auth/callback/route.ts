import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {getWebsiteFirstConfig} from "@/lib/websiteFirstConfig";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {claimWebsiteBuilderDraftForUser} from "@/lib/websiteBuilderDraft";
export async function GET(request: Request) {
  const url=new URL(request.url); const code=url.searchParams.get("code"); const requestedNext=url.searchParams.get("next") || "/app",safeNext=requestedNext.startsWith("/")&&!requestedNext.startsWith("//")?requestedNext:"/app";
  if(code){ const s=await createSupabaseServerClient(); const {error}=await s.auth.exchangeCodeForSession(code); if(!error){const {data:{user}}=await s.auth.getUser(),source=getWebsiteFirstConfig(user?.user_metadata?.acquisition_source);if(user){const admin=getSupabaseAdmin();if(admin)try{const claimed=await claimWebsiteBuilderDraftForUser(admin,user.id);if(claimed?.businessSlug)return NextResponse.redirect(new URL(`/onboarding?business=${encodeURIComponent(claimed.businessSlug)}&websiteStep=preview&success=${encodeURIComponent("Your website is saved! You can keep editing or publish when you're ready.")}`, url.origin));}catch(claimError){console.warn("Website builder draft claim after auth callback failed",{userId:user.id,message:claimError instanceof Error?claimError.message:String(claimError)});}}const destination=source&&(safeNext==="/app"||safeNext==="/onboarding")?`/onboarding?source=${source.source}`:safeNext;return NextResponse.redirect(new URL(destination, url.origin));} }
  return NextResponse.redirect(new URL("/login?error=Unable%20to%20verify%20your%20account",url.origin));
}
