export type CustomerActionIconName="calendar"|"briefcase"|"repeat"|"customer"|"archive";

export function CustomerActionIcon({name}:{name:CustomerActionIconName}){
 const common={fill:"none",stroke:"currentColor",strokeWidth:1.9,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
 return <svg viewBox="0 0 24 24" aria-hidden="true">
  {name==="calendar"&&<><rect {...common} x="3" y="5" width="18" height="16" rx="2"/><path {...common} d="M7 3v4M17 3v4M3 10h18"/></>}
  {name==="briefcase"&&<><rect {...common} x="3" y="7" width="18" height="13" rx="2"/><path {...common} d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></>}
  {name==="repeat"&&<><path {...common} d="M20 7h-3V4M4 17h3v3M18.5 5.5A8 8 0 0 0 5 8M5.5 18.5A8 8 0 0 0 19 16"/><path {...common} d="m17 7 3-3M7 17l-3 3"/></>}
  {name==="customer"&&<><circle {...common} cx="12" cy="8" r="4"/><path {...common} d="M4.5 21a7.5 7.5 0 0 1 15 0z"/></>}
  {name==="archive"&&<><path {...common} d="M4 7h16l-1 14H5z"/><path {...common} d="M3 3h18v4H3zM9 11h6"/></>}
 </svg>;
}
