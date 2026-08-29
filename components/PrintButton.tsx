"use client";
function PrinterIcon(){
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 9V4h10v5"/><path d="M6 18H5a2 2 0 0 1-2-2v-5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v5a2 2 0 0 1-2 2h-1"/><path d="M7 14h10v6H7z"/><path d="M17 12h.01"/></svg>;
}

export default function PrintButton(){
 return <button type="button" className="public-estimate-print" onClick={()=>window.print()}><PrinterIcon/><span>Print / Save PDF</span></button>;
}
