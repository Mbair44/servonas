"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

function value(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function fail(path: string, message: string): never { redirect(`${path}?error=${encodeURIComponent(message)}`); }

export async function signUp(formData: FormData) {
  const email=value(formData,"email"), password=value(formData,"password"), confirm=value(formData,"confirmPassword");
  if (!email || password.length < 8) fail("/signup","Use a valid email and a password with at least 8 characters.");
  if (password !== confirm) fail("/signup","Passwords do not match.");
  const origin=(await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase=await createSupabaseServerClient();
  const { data, error }=await supabase.auth.signUp({email,password,options:{emailRedirectTo:`${origin}/auth/callback?next=/app`}});
  if(error) fail("/signup",error.message);
  if(data.session) redirect("/app");
  redirect(`/auth/confirm?email=${encodeURIComponent(email)}`);
}

export async function signIn(formData: FormData) {
  const email=value(formData,"email"), password=value(formData,"password"), next=value(formData,"next") || "/app";
  const supabase=await createSupabaseServerClient();
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error) fail("/login",error.message);
  redirect(next.startsWith("/") ? next : "/app");
}

export async function signOut() { const s=await createSupabaseServerClient(); await s.auth.signOut(); redirect("/"); }

export async function requestPasswordReset(formData: FormData) {
  const email=value(formData,"email");
  const origin=(await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const s=await createSupabaseServerClient();
  const {error}=await s.auth.resetPasswordForEmail(email,{redirectTo:`${origin}/auth/callback?next=/reset-password`});
  if(error) fail("/forgot-password",error.message);
  redirect("/forgot-password?sent=1");
}

export async function updatePassword(formData: FormData) {
  const password=value(formData,"password"), confirm=value(formData,"confirmPassword");
  if(password.length<8) fail("/reset-password","Password must contain at least 8 characters.");
  if(password!==confirm) fail("/reset-password","Passwords do not match.");
  const s=await createSupabaseServerClient(); const {error}=await s.auth.updateUser({password});
  if(error) fail("/reset-password",error.message);
  redirect("/app?passwordUpdated=1");
}
