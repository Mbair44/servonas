import { relinkCopperStateBounce } from "./TemporaryCopperStateBounceRelinkAction";

// TEMPORARY: remove this component and its page.tsx import after CSB linkage.
export default function TemporaryCopperStateBounceRelink({ outcome }: { outcome?: string }) {
 const failed = ["verify_twilio_failed", "account_row_missing", "activation_row_missing", "phone_upsert_failed", "compliance_upsert_failed", "vault_failed", "readiness_failed"].includes(outcome ?? "");
 return <section className="workspace-panel">
  <h2>Temporary · relink Copper State Bounce</h2>
  <p>This temporary action only relinks existing resources. It makes Twilio GET requests before changing the CSB mapping, stores the entered account credential in Vault only after it authenticates as that account, marks the mapping as externally managed, and then runs readiness.</p>
  {outcome && <p role={failed ? "alert" : "status"}>{failed ? `Relink stopped at ${outcome}. No provider resources were created.` : `Relink completed; readiness is ${outcome}.`}</p>}
  <form action={relinkCopperStateBounce}>
   <label>Verified Copper State Bounce account SID <input name="targetAccountSid" required pattern="AC[0-9A-Za-z]{32}" autoComplete="off" /></label>
   <label>That account’s Auth Token <input name="targetAuthToken" type="password" required autoComplete="off" /></label>
   <label>Type RELINK CSB to confirm <input name="confirmation" required autoComplete="off" /></label>
   <p><button className="sv-button">Relink verified resources and run readiness</button></p>
  </form>
 </section>;
}
