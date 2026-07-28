"use client";
import {useRef,useState} from "react";
import {uploadCustomerImport} from "./actions";

const choices=[
 {value:"customer_list",title:"Customer list",copy:"One row generally represents one customer."},
 {value:"customer_locations",title:"Customers and service locations",copy:"Customers may repeat across rows, usually once per property."},
 {value:"customer_recurring",title:"Customers and recurring services",copy:"Rows also include service frequency or next-service details."},
 {value:"custom",title:"Custom spreadsheet",copy:"Servonas will help identify the structure during mapping."},
] as const;
export function CustomerImportUpload({businessSlug}:{businessSlug:string}){
 const input=useRef<HTMLInputElement>(null),[file,setFile]=useState<File|null>(null),[dragging,setDragging]=useState(false),[type,setType]=useState("customer_list"),[requestKey]=useState(()=>crypto.randomUUID());
 return <section className="workspace-panel customer-import-start" aria-labelledby="customer-import-upload-title">
  <div className="import-upload-heading"><div><small>Start a migration</small><h2 id="customer-import-upload-title">What is in your spreadsheet?</h2><p>Choose the closest description. You can correct the structure after Servonas reads the file.</p></div><a className="sv-button sv-secondary" href="/api/customer-imports/template">Download template</a></div>
  <form action={uploadCustomerImport.bind(null,businessSlug)}>
   <input type="hidden" name="request_key" value={requestKey}/>
   <fieldset className="customer-import-types"><legend className="sr-only">Migration type</legend>{choices.map(choice=><label className={type===choice.value?"selected":""} key={choice.value}><input type="radio" name="import_type" value={choice.value} checked={type===choice.value} onChange={()=>setType(choice.value)}/><strong>{choice.title}</strong><span>{choice.copy}</span></label>)}</fieldset>
   <div className={`import-drop-zone${dragging?" is-dragging":""}`} role="button" tabIndex={0} onClick={()=>input.current?.click()} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();input.current?.click();}}} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);if(input.current)input.current.files=event.dataTransfer.files;setFile(event.dataTransfer.files[0]??null);}}>
    <span className="import-upload-icon" aria-hidden="true">⇧</span><strong>{file?file.name:"Drop your CSV or Excel file here"}</strong><span>{file?`${(file.size/1024/1024).toFixed(2)} MB · click to replace`:"or choose a file from your device"}</span>
    <input ref={input} className="sr-only" name="customer_file" type="file" required accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event=>setFile(event.target.files?.[0]??null)}/>
   </div>
   <div className="import-guidance"><div><strong>Accepted files</strong><span>.csv or .xlsx · 25 MB maximum</span></div><div><strong>Import capacity</strong><span>Up to 25,000 rows and 150 columns</span></div><div><strong>Private and resumable</strong><span>Source data is tenant-isolated and retained for 30 days</span></div></div>
   <p className="import-columns">Nothing is imported yet. You will choose a worksheet, match columns, correct problems, resolve duplicates, and review the exact changes before committing.</p>
   <button className="sv-button" disabled={!file}>Upload and inspect</button>
  </form>
 </section>;
}
