"use client";

import { useRef } from "react";

export default function InvoicePaymentActions({payment,refundAction,voidAction}:{
  payment:{provider:string;status:string;refundableCents:number;currency:string};
  refundAction:(data:FormData)=>void|Promise<void>;
  voidAction?:(data:FormData)=>void|Promise<void>;
}){
  const requestKey=useRef(crypto.randomUUID());
  if(payment.refundableCents<=0&&payment.status!=="succeeded")return null;
  return <div className="invoice-payment-actions">
    {payment.refundableCents>0&&["succeeded","partially_refunded"].includes(payment.status)&&<details>
      <summary>Issue refund</summary>
      <form action={refundAction}>
        <input type="hidden" name="requestKey" value={requestKey.current}/>
        <label>Amount<input required name="amount" type="number" min=".01" step=".01" max={(payment.refundableCents/100).toFixed(2)} defaultValue={(payment.refundableCents/100).toFixed(2)}/></label>
        <label>Refund method<select name="refundMethod" defaultValue={payment.provider==="stripe"?"provider":"offline"}>
          {payment.provider==="stripe"&&<option value="provider">Refund through Stripe</option>}
          <option value="offline">Record refund issued outside Servonas</option>
        </select></label>
        <label>Reason<input required name="reason" minLength={3} maxLength={500}/></label>
        <label>Reference<input name="reference" maxLength={160} placeholder="Optional offline reference"/></label>
        <label>Internal note<textarea name="notes" rows={2} maxLength={1000}/></label>
        <button className="sv-button sv-danger">Issue refund</button>
      </form>
    </details>}
    {voidAction&&payment.provider==="offline"&&payment.status==="succeeded"&&<details>
      <summary>Void payment</summary>
      <form action={voidAction}><label>Reason<input required name="reason" minLength={3} maxLength={500}/></label><button className="sv-button sv-danger">Void payment</button></form>
    </details>}
  </div>;
}
