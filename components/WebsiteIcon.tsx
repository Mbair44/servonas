export type WebsiteIconName="eye"|"send"|"external"|"check"|"alert"|"calendar"|"pin"|"globe"|"store"|"tools"|"clock"|"shield"|"save"|"upload"|"plus"|"arrow";

export function WebsiteIcon({name}:{name:WebsiteIconName}){
 const paths:Record<WebsiteIconName,React.ReactNode>={
  eye:<><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></>,
  send:<><path d="m21 3-8.2 18-2.6-7.2L3 11.2 21 3Z"/><path d="m10.2 13.8 4.5-4.5"/></>,
  external:<><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6H5V6h6"/></>,
  check:<path d="m5 12 4.2 4.2L19 6.5"/>,
  alert:<><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17.2v.1"/></>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
  pin:<><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  globe:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></>,
  store:<><path d="M4 10v10h16V10M3 10l2-6h14l2 6"/><path d="M3 10c1.5 2 3.5 2 5 0 1.5 2 3.5 2 5 0 1.5 2 3.5 2 5 0 1 1.3 2 1.3 3 0"/><path d="M9 20v-6h6v6"/></>,
  tools:<><path d="m14.5 6.5 3-3 3 3-3 3M13 8l-9 9 3 3 9-9"/><path d="m5 4 3 3-2 2-3-3V3h3l3 3"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
  shield:<><path d="M12 3 4.5 6v5.5c0 4.6 3 7.7 7.5 9.5 4.5-1.8 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m8.5 12 2.3 2.3 4.7-5"/></>,
  save:<><path d="M5 3h12l3 3v15H4V3h1Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>,
  upload:<><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 14v6h16v-6"/></>,
  plus:<path d="M12 5v14M5 12h14"/>,
  arrow:<path d="M5 12h14m-5-5 5 5-5 5"/>,
 };
 return <svg className="website-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
