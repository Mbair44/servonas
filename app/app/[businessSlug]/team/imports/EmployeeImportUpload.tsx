"use client";
import {useRef,useState} from "react";
import {uploadEmployeeImport} from "./actions";

export function EmployeeImportUpload({businessSlug}:{businessSlug:string}){
  const input=useRef<HTMLInputElement>(null);
  const [file,setFile]=useState<File|null>(null);
  const [dragging,setDragging]=useState(false);
  const [requestKey]=useState(()=>crypto.randomUUID());
  const action=uploadEmployeeImport.bind(null,businessSlug);
  return <section className="workspace-panel import-upload-panel" aria-labelledby="employee-import-title">
    <div className="import-upload-heading"><div><small>Step 1</small><h2 id="employee-import-title">Upload your employee file</h2><p>Your original file is private, tenant-isolated, and retained for 30 days while you complete the import.</p></div><a className="sv-button sv-secondary" href="/api/team-imports/template">Download template</a></div>
    <form action={action}>
      <input type="hidden" name="request_key" value={requestKey}/>
      <div className={`import-drop-zone${dragging?" is-dragging":""}`} role="button" tabIndex={0}
        onClick={()=>input.current?.click()} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();input.current?.click();}}}
        onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onDrop={event=>{event.preventDefault();setDragging(false);if(input.current) input.current.files=event.dataTransfer.files;setFile(event.dataTransfer.files[0]??null);}}>
        <span className="import-upload-icon" aria-hidden="true">⇧</span>
        <strong>{file?file.name:"Drop a CSV or Excel file here"}</strong>
        <span>{file?`${(file.size/1024).toFixed(1)} KB · click to replace`:"or choose a file from your device"}</span>
        <input ref={input} className="sr-only" type="file" name="employee_file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required onChange={event=>setFile(event.target.files?.[0]??null)}/>
      </div>
      <div className="import-guidance">
        <div><strong>Accepted files</strong><span>.csv or .xlsx · 10 MB maximum</span></div>
        <div><strong>Import capacity</strong><span>Up to 2,000 rows and 100 columns</span></div>
        <div><strong>File safety</strong><span>Values only; formulas and password-protected workbooks are rejected</span></div>
      </div>
      <p className="import-columns"><strong>Suggested columns:</strong> First Name, Last Name, Email, Phone, Employee ID, Role, Employee Type, Start Date, Status, Manager, Location, Territory, Skills, Invite.</p>
      <button className="sv-button" type="submit" disabled={!file}>Upload and continue</button>
    </form>
  </section>;
}
