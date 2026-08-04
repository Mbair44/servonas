"use client";

import Link from "next/link";
import {useActionState,useEffect,useRef,useState,type FormEvent} from "react";
import {trackGoogleAdsSignupConversion} from "@/lib/googleAds";

type AuthActionResult={signupCompleted:boolean;userId:string|null;redirectTo:string}|null|void;

function PasswordVisibilityIcon({visible}:{visible:boolean}){
 return visible
  ?<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.3A10.7 10.7 0 0112 4c5.5 0 9 6 9 6a16.8 16.8 0 01-2.1 2.8M6.6 6.6C4.3 8.1 3 10 3 10s3.5 6 9 6a9.6 9.6 0 004.1-.9"/></svg>
  :<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.5"/></svg>;
}

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
  action: (fd: FormData) => AuthActionResult | Promise<AuthActionResult>;
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
  const [showPassword,setShowPassword]=useState(false);
  const [showConfirmation,setShowConfirmation]=useState(false);
  const [attempted,setAttempted]=useState(false);
  const trackedSignup=useRef<string|null>(null);
  const [actionResult,formAction,pending]=useActionState(async(_previous:AuthActionResult,formData:FormData)=>await action(formData),null);
  useEffect(()=>{
    if(!actionResult)return;
    if(actionResult.signupCompleted&&actionResult.userId&&trackedSignup.current!==actionResult.userId){
      trackedSignup.current=actionResult.userId;
      let navigated=false;
      const navigate=()=>{
        if(navigated)return;
        navigated=true;
        window.location.assign(actionResult.redirectTo);
      };
      const fallback=window.setTimeout(navigate,900);
      const handedToGoogle=trackGoogleAdsSignupConversion(actionResult.userId,()=>{
        window.clearTimeout(fallback);
        navigate();
      });
      if(!handedToGoogle){
        window.clearTimeout(fallback);
        navigate();
      }
      return;
    }
    window.location.assign(actionResult.redirectTo);
  },[actionResult]);
  const passwordsDiffer=requiresConfirmation&&confirmation.length>0&&password!==confirmation;
  const passwordMissing=attempted&&requiresConfirmation&&!password;
  const passwordTooShort=requiresConfirmation&&password.length>0&&password.length<8;
  const confirmationMissing=attempted&&requiresConfirmation&&!confirmation;
  const confirmationTooShort=requiresConfirmation&&confirmation.length>0&&confirmation.length<8;
  const passwordError=passwordMissing||passwordTooShort;
  const confirmationError=confirmationMissing||confirmationTooShort||passwordsDiffer;
  const preventInvalidPasswordSubmit=(event:FormEvent<HTMLFormElement>)=>{
    setAttempted(true);
    if(requiresConfirmation&&(!password||password.length<8||!confirmation||confirmation.length<8||password!==confirmation)){
      event.preventDefault();
    }
  };
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
        <form action={formAction} className="auth-form" noValidate onSubmit={preventInvalidPasswordSubmit}>
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
              <span className="auth-password-field">
                <input name="password" type={showPassword?"text":"password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={event=>setPassword(event.target.value)} aria-invalid={passwordError} aria-describedby={passwordError?"password-error":undefined}/>
                <button type="button" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?"Hide password":"Show password"} aria-pressed={showPassword}><PasswordVisibilityIcon visible={showPassword}/></button>
              </span>
              {passwordMissing&&<span className="auth-field-error" id="password-error" role="alert">Enter a password.</span>}
              {passwordTooShort&&<span className="auth-field-error" id="password-error" role="alert">Password must be at least 8 characters.</span>}
            </label>
          )}
          {requiresConfirmation && (
            <label>
              Confirm password
              <span className="auth-password-field">
                <input name="confirmPassword" type={showConfirmation?"text":"password"} autoComplete="new-password" minLength={8} required value={confirmation} onChange={event=>setConfirmation(event.target.value)} aria-invalid={confirmationError} aria-describedby={confirmationError?"password-confirmation-error":undefined}/>
                <button type="button" onClick={()=>setShowConfirmation(value=>!value)} aria-label={showConfirmation?"Hide confirmed password":"Show confirmed password"} aria-pressed={showConfirmation}><PasswordVisibilityIcon visible={showConfirmation}/></button>
              </span>
              {confirmationMissing&&<span className="auth-field-error" id="password-confirmation-error" role="alert">Confirm your password.</span>}
              {!confirmationMissing&&confirmationTooShort&&<span className="auth-field-error" id="password-confirmation-error" role="alert">Confirmation must be at least 8 characters.</span>}
              {!confirmationMissing&&!confirmationTooShort&&passwordsDiffer&&<span className="auth-field-error" id="password-confirmation-error" role="alert">Passwords do not match.</span>}
            </label>
          )}
          <button className="sv-button sv-full" type="submit" disabled={pending||passwordTooShort||confirmationTooShort||passwordsDiffer}>
            {pending?"Please wait…":mode === "login" ? "Log in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Update password"}
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
