export type CustomerActionIconName="calendar"|"briefcase"|"repeat"|"customer"|"archive"|"location"|"clock"|"card"|"chart"|"check";

export function CustomerActionIcon({name}:{name:CustomerActionIconName}){
 const common={fill:"none",stroke:"currentColor",strokeWidth:1.9,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
 return <svg viewBox="0 0 24 24" aria-hidden="true">
  {name==="calendar"&&<><rect {...common} x="3" y="5" width="18" height="16" rx="2"/><path {...common} d="M7 3v4M17 3v4M3 10h18"/></>}
  {name==="briefcase"&&<><rect {...common} x="3" y="7" width="18" height="13" rx="2"/><path {...common} d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></>}
  {name==="repeat"&&<><path {...common} d="M20 7h-3V4M4 17h3v3M18.5 5.5A8 8 0 0 0 5 8M5.5 18.5A8 8 0 0 0 19 16"/><path {...common} d="m17 7 3-3M7 17l-3 3"/></>}
  {name==="customer"&&<><circle {...common} cx="12" cy="8" r="4"/><path {...common} d="M4.5 21a7.5 7.5 0 0 1 15 0z"/></>}
  {name==="archive"&&<><path {...common} d="M4 7h16l-1 14H5z"/><path {...common} d="M3 3h18v4H3zM9 11h6"/></>}
  {name==="location"&&<><path {...common} d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"/><circle {...common} cx="12" cy="10" r="2.5"/></>}
  {name==="clock"&&<><circle {...common} cx="12" cy="12" r="9"/><path {...common} d="M12 7v6l4 2"/></>}
  {name==="card"&&<><rect {...common} x="3" y="5" width="18" height="14" rx="2"/><path {...common} d="M3 9h18M7 15h4"/></>}
  {name==="chart"&&<><path {...common} d="M4 20V4M4 20h16M7 16l4-5 3 2 5-7"/><path {...common} d="M15 6h4v4"/></>}
  {name==="check"&&<><circle {...common} cx="12" cy="12" r="9"/><path {...common} d="m8 12 2.5 2.5L16 9"/></>}
 </svg>;
}
