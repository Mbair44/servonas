"use client";
import {useState} from "react";
import {formatEmployeeNumber,type EmployeeNumbering} from "@/lib/employeeNumbering";
export function EmployeeNumberingSettings({value,action}:{value:EmployeeNumbering;action:(formData:FormData)=>void|Promise<void>}){
 const [prefix,setPrefix]=useState(value.prefix),[next,setNext]=useState(value.nextNumber),[digits,setDigits]=useState(value.minimumDigits);
 return <section className="workspace-panel employee-numbering-settings" id="employee-numbering"><div className="panel-title"><div><h2>Employee numbering</h2><p>Control how employee numbers are assigned for this business.</p></div><div className="number-preview"><span>Preview</span><strong>{formatEmployeeNumber(prefix,next,digits)}</strong></div></div>
  <form action={action} className="settings-form" onSubmit={event=>{if(next!==value.nextNumber&&!window.confirm("Changing the next number affects future employees only. Existing employee numbers will not change."))event.preventDefault();}}>
   <fieldset><label className="settings-check"><input type="checkbox" name="autoAssignEnabled" defaultChecked={value.autoAssignEnabled}/>Automatically assign an employee number when an employee is created</label>
   <label>Prefix <small>Optional</small><input name="prefix" value={prefix} onChange={event=>setPrefix(event.target.value)} maxLength={10} pattern="[A-Za-z0-9_-]*" placeholder="EMP-"/></label>
   <label>Starting number<input required name="startingNumber" type="number" min="1" step="1" defaultValue={value.startingNumber}/><small>Changing this does not alter existing employees.</small></label>
   <label>Minimum digits<input required name="minimumDigits" type="number" min="1" max="10" step="1" value={digits} onChange={event=>setDigits(Number(event.target.value))}/></label>
   <label>Next employee number<input required name="nextNumber" type="number" min="1" step="1" value={next} onChange={event=>setNext(Number(event.target.value))}/><small>Future employees only. Existing numbers will not change.</small></label>
   <label className="settings-check"><input type="checkbox" name="allowManualOverride" defaultChecked={value.allowManualOverride}/>Allow authorized users to enter a custom employee number</label>
   <button className="sv-button">Save employee numbering</button></fieldset>
  </form>
 </section>;
}
