"use client";

import { useRef } from "react";

export default function OfflinePaymentForm({
  action,balance,
}:{
  action:(data:FormData)=>void|Promise<void>;
  balance:string;
}){
  const requestKey=useRef(crypto.randomUUID());
  const now=new Date();
  now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
  return <form action={action} className="estimate-form">
    <input type="hidden" name="requestKey" value={requestKey.current}/>
    <label>Amount<input required name="amount" type="number" min=".01" step=".01" max={balance} defaultValue={balance}/></label>
    <label>Method<select name="method" defaultValue="check"><option value="cash">Cash</option><option value="check">Check</option><option value="bank_transfer">Bank transfer</option><option value="external_card_terminal">External card terminal</option><option value="other">Other / deposit application</option></select></label>
    <label>Received<input required name="receivedAt" type="datetime-local" defaultValue={now.toISOString().slice(0,16)}/></label>
    <label>Reference<input name="reference" maxLength={160} placeholder="Check number or reference"/></label>
    <label className="wide">Internal note<textarea name="notes" rows={2} maxLength={1000}/></label>
    <button className="sv-button">Record payment</button>
  </form>;
}
