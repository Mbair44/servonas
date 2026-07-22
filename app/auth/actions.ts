"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

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

  return "We couldn’t create your account. Please try again.";
}

export async function signUp(formData: FormData) {
  const email = value(formData, "email");
  const password = value(formData, "password");
  const confirm = value(formData, "confirmPassword");
  const next = value(formData, "next") || "/app";
  const safeNext = next.startsWith("/") ? next : "/app";
  const signupPath = `/signup?next=${encodeURIComponent(safeNext)}&email=${encodeURIComponent(email)}`;

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
    },
  });

  if (error) {
    console.error("Signup failed", { code: error.code, status: error.status });
    redirectWithError(signupPath, signupErrorMessage(error.message));
  }

  if (data.session) redirect(safeNext);
  redirect(`/auth/confirm?email=${encodeURIComponent(email)}`);
}

export async function signIn(formData: FormData) {
  const email = value(formData, "email");
  const password = value(formData, "password");
  const next = value(formData, "next") || "/app";
  const safeNext = next.startsWith("/") ? next : "/app";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) redirectWithError("/login", error.message);
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
