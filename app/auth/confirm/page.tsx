import {resendSignupVerification} from "../actions";
export default async function Page({searchParams}:{searchParams:Promise<{email?:string;sent?:string;error?:string}>}){
 const {email,sent,error}=await searchParams;
 return <main className="auth-shell"><section className="auth-card"><h1>Verify your email</h1>
  {sent==="1"?<p className="auth-success">A new verification email was requested. Check your inbox and spam folder.</p>:<p>We requested a confirmation link for <strong>{email||"your email address"}</strong>. Open it to activate your account and continue to Servonas.</p>}
  {error&&<p className="auth-error" role="alert">{error}</p>}
  <form action={resendSignupVerification}><label>Email address<input required type="email" name="email" defaultValue={email??""} autoComplete="email"/></label><button className="sv-button">Resend verification email</button></form>
  <p><small>If no message appears after a few minutes, the Supabase Auth email provider must be checked by a Servonas administrator.</small></p>
 </section></main>;
}
