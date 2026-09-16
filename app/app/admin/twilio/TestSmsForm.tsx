"use client";

import { useState } from "react";
import { sendTestSms } from "./testActions";
import { formatTestSmsDestination, normalizeTestSmsDestination } from "./testSmsDestination";

export default function TestSmsForm({ requestKey, disabled, businessName }: { requestKey: string; disabled: boolean; businessName: string }) {
 const [display, setDisplay] = useState("");
 const normalized = normalizeTestSmsDestination(display);
 return <form action={sendTestSms} onSubmit={(event) => { if (!normalized) event.preventDefault(); }}>
  <input type="hidden" name="requestKey" value={requestKey}/><input type="hidden" name="to" value={normalized}/>
  <fieldset disabled={disabled}><legend>Send one real test SMS</legend><label>Destination <input type="tel" inputMode="tel" placeholder="(480) 555-0123" value={display} onChange={(event) => setDisplay(formatTestSmsDestination(event.target.value))} pattern="(?:\\+?1[ .-]?)?\\(?[2-9][0-9]{2}\\)?[ .-]?[0-9]{3}[ .-]?[0-9]{4}" required/></label><p>The message identifies {businessName}, asks for a reply, and includes STOP instructions.</p><label><input type="checkbox" name="consent" required/> This recipient agreed to this test SMS and any Twilio charges.</label><p><button className="sv-button">Send test SMS</button></p></fieldset>
 </form>;
}
