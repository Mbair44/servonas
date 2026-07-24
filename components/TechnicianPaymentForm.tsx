"use client";
import {useRef} from "react";
export default function TechnicianPaymentForm({action,balance}:{action:(data:FormData)=>void|Promise<void>;balance:string}){
 const key=useRef(crypto.randomUUID());
 return <form className="tech-action-form" action={action}><input type="hidden" name="requestKey" value={key.current}/><label>Amount<input required name="amount" type="number" min=".01" step=".01" max={balance} defaultValue={balance}/></label><label>Method<select name="method"><option value="cash">Cash</option><option value="check">Check</option></select></label><label>Reference<input name="reference" maxLength={160}/></label><button className="sv-button">Record payment</button></form>;
}
