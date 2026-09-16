import { relinkCopperStateBounce } from "./TemporaryCopperStateBounceRelinkAction";

// TEMPORARY: remove this component and its page.tsx import after CSB linkage.
export default function TemporaryCopperStateBounceRelink({ outcome }: { outcome?: string }) {
 return <section className="workspace-panel">
  <h2>Temporary · relink Copper State Bounce</h2>
  <p>This action only relinks existing resources. It makes Twilio GET requests before changing the CSB mapping, replaces the Vault credential only after it authenticates as the entered tenant account, and then runs readiness.</p>
  {outcome && <p role={outcome === "failed" ? "alert" : "status"}>{outcome === "failed" ? "Relink was not completed. No provider resources were created." : `Relink completed; readiness is ${outcome}.`}</p>}
  <form action={relinkCopperStateBounce}>
   <label>Verified Copper State Bounce account SID <input name="targetAccountSid" required pattern="AC[0-9A-Za-z]{32}" autoComplete="off" /></label>
   <label>That account’s Auth Token <input name="targetAuthToken" type="password" required autoComplete="off" /></label>
   <label>Type RELINK CSB to confirm <input name="confirmation" required autoComplete="off" /></label>
   <p><button className="sv-button">Relink verified resources and run readiness</button></p>
  </form>
 </section>;
}
