"use client";

import { useRef,useState } from "react";
import { formatCents } from "@/lib/financial/priceBook";

export default function InvoicePaymentForm({token,balanceDueCents,depositRemainingCents,allowPartialPayments,minimumPartialPaymentCents,currency}:{
  token:string;
  balanceDueCents:number;
  depositRemainingCents:number;
  allowPartialPayments:boolean;
  minimumPartialPaymentCents:number;
  currency:string;
}){
  const requestKey=useRef(crypto.randomUUID());
  const [purpose,setPurpose]=useState<"balance"|"deposit"|"partial">("balance");
  return <form action={`/api/invoice/${encodeURIComponent(token)}/checkout`} method="post" className="invoice-payment-form">
    <input type="hidden" name="requestKey" value={requestKey.current}/>
    <fieldset>
      <legend>Choose a payment amount</legend>
      <label><input type="radio" name="purpose" value="balance" checked={purpose==="balance"} onChange={()=>setPurpose("balance")}/><span><strong>Pay balance</strong><small>{formatCents(balanceDueCents,currency)}</small></span></label>
      {depositRemainingCents>0&&depositRemainingCents<balanceDueCents&&<label><input type="radio" name="purpose" value="deposit" checked={purpose==="deposit"} onChange={()=>setPurpose("deposit")}/><span><strong>Pay required deposit</strong><small>{formatCents(depositRemainingCents,currency)}</small></span></label>}
      {allowPartialPayments&&<label><input type="radio" name="purpose" value="partial" checked={purpose==="partial"} onChange={()=>setPurpose("partial")}/><span><strong>Make a partial payment</strong><small>Minimum {formatCents(minimumPartialPaymentCents,currency)}</small></span></label>}
    </fieldset>
    {purpose==="partial"&&<label className="invoice-partial-amount">Payment amount<input required name="partialAmount" type="number" inputMode="decimal" min={(Math.max(50,minimumPartialPaymentCents)/100).toFixed(2)} max={(balanceDueCents/100).toFixed(2)} step=".01" placeholder="0.00"/></label>}
    <button type="submit">Continue to secure payment</button>
    <small>You’ll complete payment on Stripe’s secure checkout page.</small>
  </form>;
}
