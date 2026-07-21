import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
export async function GET(request: Request) {
  const url=new URL(request.url); const code=url.searchParams.get("code"); const next=url.searchParams.get("next") || "/app";
  if(code){ const s=await createSupabaseServerClient(); const {error}=await s.auth.exchangeCodeForSession(code); if(!error) return NextResponse.redirect(new URL(next, url.origin)); }
  return NextResponse.redirect(new URL("/login?error=Unable%20to%20verify%20your%20account",url.origin));
}
