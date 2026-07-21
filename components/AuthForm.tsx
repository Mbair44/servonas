import Link from "next/link";

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
        <form action={action} className="auth-form">
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
              <input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
            </label>
          )}
          {(isSignup || isReset) && (
            <label>
              Confirm password
              <input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
            </label>
          )}
          <button className="sv-button sv-full" type="submit">
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
