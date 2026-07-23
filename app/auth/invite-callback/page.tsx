"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";

const safeNext = (value: string | null) => value?.startsWith("/") && !value.startsWith("//") ? value : "/app";

export default function InviteCallback() {
  const [error, setError] = useState("");
  useEffect(() => {
    async function finishInvitation() {
      const url = new URL(window.location.href);
      const next = safeNext(url.searchParams.get("next"));
      const hash = new URLSearchParams(url.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const code = url.searchParams.get("code");
      const supabase = createSupabaseBrowserClient();
      const result = accessToken && refreshToken
        ? await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        : code
          ? await supabase.auth.exchangeCodeForSession(code)
          : { error: new Error("The invitation link did not contain an authentication session.") };
      if (result.error) {
        setError("This invitation link could not be verified. Copy the pending invitation link or ask an administrator to resend it.");
        return;
      }
      window.location.replace(next);
    }
    void finishInvitation();
  }, []);
  return <main className="auth-page"><section className="auth-card"><span className="sv-kicker">Team invitation</span><h1>Verifying invitation</h1>{error ? <p className="auth-error">{error}</p> : <p>Please wait while we securely finish your invitation.</p>}</section></main>;
}
