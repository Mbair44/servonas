"use client";

import {useId, useState, type ReactNode} from "react";

export function MetricInfoTooltip({label, children}:{label:string;children:ReactNode}){
 const id=useId();
 const [open,setOpen]=useState(false);
 return <span className="metric-info-tooltip">
  <button type="button" aria-label={`About ${label}`} aria-describedby={id} aria-expanded={open} onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onClick={()=>setOpen(true)} onKeyDown={event=>{if(event.key==="Escape"){setOpen(false);event.currentTarget.blur();}}}>i</button>
  <span id={id} role="tooltip" hidden={!open}>{children}</span>
 </span>;
}
