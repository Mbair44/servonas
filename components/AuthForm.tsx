"use client";

import Link from "next/link";
import {useState} from "react";

export default function AuthForm({
  title,
  subtitle,
  action,
  mode,
  error,
  next,
  email,
}: {
  title: string;
  subtitle: string;
  action: (fd: FormData) => void | Promise<void>;
  mode: "login" | "signup" | "forgot" | "reset";
  error?: string;
  next?: string;
  email?: string;
}) {
  const isSignup = mode === "signup";
  const isReset = mode === "reset";
  const requiresConfirmation = isSignup || isReset;
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const passwordsDiffer=requiresConfirmation&&confirmation.length>0&&password!==confirmation;
  const preservedQuery = new URLSearchParams();
  if (next) preservedQuery.set("next", next);
  if (email) preservedQuery.set("email", email);
  const queryString = preservedQuery.toString();

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link href="/" className="auth-logo"><img src="/servonas-logo.svg" alt="Servonas" /></Link>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {error && <div className="auth-error">{error}</div>}
        <form action={action} className="auth-form" noValidate>
          {next && <input type="hidden" name="next" value={next} />}
          {!isReset && (
            <label>
              Email
              <input name="email" type="email" autoComplete="email" defaultValue={email} required />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              Password
              <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={event=>setPassword(event.target.value)} />
            </label>
          )}
          {requiresConfirmation && (
            <label>
              Confirm password
              <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event=>setConfirmation(event.target.value)} aria-invalid={passwordsDiffer} aria-describedby={passwordsDiffer?"password-match-error":undefined}/>
            </label>
          )}
          {passwordsDiffer&&<div className="auth-field-error" id="password-match-error" role="alert">Passwords do not match.</div>}
          <button className="sv-button sv-full" type="submit" disabled={passwordsDiffer}>
            {mode === "login" ? "Log in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Update password"}
          </button>
        </form>
        <div className="auth-links">
          {mode === "login" && (
            <>
              <Link href="/forgot-password">Forgot password?</Link>
              <span>New to Servonas? <Link href={`/signup${queryString ? `?${queryString}` : ""}`}>Create an account</Link></span>
            </>
          )}
          {mode === "signup" && (
            <span>Already have an account? <Link href={`/login${queryString ? `?${queryString}` : ""}`}>Log in</Link></span>
          )}
        </div>
      </section>
    </main>
  );
}
