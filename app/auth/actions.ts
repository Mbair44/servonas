"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {isWebsiteFirstSource} from "@/lib/websiteFirstConfig";
import {linkAcquisitionSession} from "@/lib/acquisitionFunnel";
import {claimWebsiteBuilderDraftForUser} from "@/lib/websiteBuilderDraft";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithError(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

function signupErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("email rate limit exceeded")) {
    return "Too many verification emails were requested. Please wait a few minutes and try again.";
  }

  if (
    normalized.includes("user already registered") ||
    normalized.includes("already been registered") ||
    normalized.includes("already registered")
  ) {
    return "An account already exists for this email. Try logging in instead.";
  }

  if (normalized.includes("invalid email")) {
    return "Enter a valid email address.";
  }
  if (
    normalized.includes("error sending confirmation") ||
    normalized.includes("smtp") ||
    normalized.includes("email provider")
  ) {
    return "Your account was created, but the verification email could not be sent. Use the resend option or contact support.";
  }

  return "We couldn’t create your account. Please try again.";
}

export async function signUp(formData: FormData) {
  const email = value(formData, "email");
  const password = value(formData, "password");
  const confirm = value(formData, "confirmPassword");
  const utmContent=value(formData,"utmContent");
  const rawSource=value(formData,"source"),source=isWebsiteFirstSource(rawSource)?rawSource:"";
  const marketingVisitorId=value(formData,"marketingVisitorId"),marketingSessionId=value(formData,"marketingSessionId");
  const acquisitionSessionId=value(formData,"acquisitionSessionId");
  const next = value(formData, "next") || (source?`/onboarding?source=${source}`:"/app");
  const safeNext = next.startsWith("/")&&!next.startsWith("//") ? next : "/app";
  const signupPath = `/signup?next=${encodeURIComponent(safeNext)}&email=${encodeURIComponent(email)}${source?`&source=${source}`:""}${/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(utmContent)?`&utm_content=${encodeURIComponent(utmContent)}`:""}`;

  if (!email || password.length < 8) {
    redirectWithError(
      signupPath,
      "Use a valid email and a password with at least 8 characters.",
    );
  }

  if (password !== confirm) {
    redirectWithError(signupPath, "Passwords do not match.");
  }

  const origin =
    (await headers()).get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
      data:source?{acquisition_source:source}:undefined,
    },
  });

  if (error) {
    console.error("Signup failed", {
      provider: "supabase_auth",
      operation: "signup_confirmation",
      code: error.code,
      status: error.status,
      message: error.message,
      name: error.name,
      redirectTo: `${origin}/auth/callback`,
    });
    redirectWithError(signupPath, signupErrorMessage(error.message));
  }

  console.info("Signup accepted by Supabase Auth", {
    provider: "supabase_auth",
    operation: "signup_confirmation",
    userId: data.user?.id ?? null,
    confirmationSentAt: data.user?.confirmation_sent_at ?? null,
    hasSession: Boolean(data.session),
    identityCount: data.user?.identities?.length ?? null,
    redirectTo: `${origin}/auth/callback`,
  });
  // Supabase can intentionally return an obfuscated user with no identities for
  // an existing email. Only a newly created identity is a completed signup.
  const signupCompleted = Boolean(data.user && (data.user.identities?.length ?? 0) > 0);
  if(signupCompleted&&source){const admin=getSupabaseAdmin();if(admin)try{await linkAcquisitionSession(admin,{sessionId:acquisitionSessionId,industry:source,userId:data.user!.id,event:"servonas_signup_completed"});}catch{console.warn("Website acquisition signup analytics could not be recorded");}}
  if(signupCompleted&&data.session&&data.user){
    const admin=getSupabaseAdmin();
    if(admin)try{
      const claimed=await claimWebsiteBuilderDraftForUser(admin,data.user.id);
      if(claimed?.businessSlug){
        return {
          signupCompleted,
          userId: data.user.id,
          redirectTo: `/onboarding?business=${encodeURIComponent(claimed.businessSlug)}&websiteStep=preview&success=${encodeURIComponent("Your website is saved! You can keep editing or publish when you're ready.")}`,
        };
      }
    }catch(claimError){
      console.warn("Website builder draft claim after signup failed",{userId:data.user.id,message:claimError instanceof Error?claimError.message:String(claimError)});
    }
  }
  if(signupCompleted&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(utmContent)){
    const admin=getSupabaseAdmin();
    if(admin){const {error:attributionError}=await admin.rpc("record_marketing_content_signup",{p_content_code:utmContent,p_user_id:data.user!.id});if(attributionError)console.error("Marketing signup attribution could not be saved",{utmContent,userId:data.user!.id,code:attributionError.code});}
  }
  if(signupCompleted&&/^[0-9a-f-]{36}$/i.test(marketingVisitorId)){
    const admin=getSupabaseAdmin();if(admin){await admin.from("marketing_visitors").update({converted_user_id:data.user!.id,converted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("visitor_id",marketingVisitorId);if(/^[0-9a-f-]{36}$/i.test(marketingSessionId))await admin.from("marketing_page_events").insert({visitor_id:marketingVisitorId,session_id:marketingSessionId,event_type:"signup_completed",path:"/signup",utm_content:utmContent||null,metadata:{user_id:data.user!.id}});}
  }
  return {
    signupCompleted,
    userId: signupCompleted ? data.user!.id : null,
    redirectTo: data.session ? safeNext : `/auth/confirm?email=${encodeURIComponent(email)}&next=${encodeURIComponent(safeNext)}${source?`&source=${source}`:""}`,
  };
}

export async function resendSignupVerification(formData: FormData) {
  const email = value(formData, "email");
  const rawSource=value(formData,"source"),source=isWebsiteFirstSource(rawSource)?rawSource:"";
  const requestedNext=value(formData,"next")||(source?`/onboarding?source=${source}`:"/onboarding");
  const safeNext=requestedNext.startsWith("/")&&!requestedNext.startsWith("//")?requestedNext:"/onboarding";
  if (!email) redirectWithError("/auth/confirm", "Enter the email address used to sign up.");
  const origin =
    (await headers()).get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    console.error("Signup verification resend failed", {
      provider: "supabase_auth",
      operation: "resend_signup_confirmation",
      code: error.code,
      status: error.status,
      message: error.message,
      name: error.name,
      redirectTo: `${origin}/auth/callback`,
    });
    redirectWithError(
      `/auth/confirm?email=${encodeURIComponent(email)}&next=${encodeURIComponent(safeNext)}${source?`&source=${source}`:""}`,
      signupErrorMessage(error.message),
    );
  }
  console.info("Signup verification resend accepted by Supabase Auth", {
    provider: "supabase_auth",
    operation: "resend_signup_confirmation",
    redirectTo: `${origin}/auth/callback`,
  });
  redirect(`/auth/confirm?email=${encodeURIComponent(email)}&sent=1&next=${encodeURIComponent(safeNext)}${source?`&source=${source}`:""}`);
}

export async function signIn(formData: FormData) {
  const email = value(formData, "email");
  const password = value(formData, "password");
  const next = value(formData, "next") || "/app";
  const safeNext = next.startsWith("/") ? next : "/app";
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) redirectWithError("/login", error.message);
  const userId=data.user?.id;
  if(userId){
    const admin=getSupabaseAdmin();
    if(admin){
      try{
        const claimed=await claimWebsiteBuilderDraftForUser(admin,userId);
        if(claimed?.businessSlug)redirect(`/onboarding?business=${encodeURIComponent(claimed.businessSlug)}&websiteStep=preview&success=${encodeURIComponent("Your website is saved! You can keep editing or publish when you're ready.")}`);
      }catch(claimError){
        console.warn("Website builder draft claim after sign-in failed",{userId,message:claimError instanceof Error?claimError.message:String(claimError)});
      }
    }
  }
  redirect(safeNext);
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(formData: FormData) {
  const email = value(formData, "email");
  const origin =
    (await headers()).get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) redirectWithError("/forgot-password", error.message);
  redirect("/forgot-password?sent=1");
}

export async function updatePassword(formData: FormData) {
  const password = value(formData, "password");
  const confirm = value(formData, "confirmPassword");

  if (password.length < 8) {
    redirectWithError(
      "/reset-password",
      "Password must contain at least 8 characters.",
    );
  }

  if (password !== confirm) {
    redirectWithError("/reset-password", "Passwords do not match.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) redirectWithError("/reset-password", error.message);
  redirect("/app?passwordUpdated=1");
}
