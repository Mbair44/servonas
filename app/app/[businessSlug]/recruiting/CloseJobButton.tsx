"use client";
export function CloseJobButton({action}:{action:(formData:FormData)=>void}){return <form action={action} onSubmit={event=>{if(!window.confirm("Close this published job? Existing applications will be preserved."))event.preventDefault();}}><button className="sv-button danger">Close Job</button></form>;}
