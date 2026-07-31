export type InvoicePaymentIconName="payment"|"card"|"lock"|"cash"|"check"|"phone";

export default function InvoicePaymentIcon({name,className}:{name:InvoicePaymentIconName;className?:string}){
 const line={fill:"none",stroke:"currentColor",strokeWidth:1.9,strokeLinecap:"round" as const,strokeLinejoin:"round" as const};
 return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
  {name==="payment"&&<><path {...line} d="M4 8.5h16v11H4zM7 8.5V6h10v2.5M9 6V4h6v2"/><path {...line} d="M8 13h8M9.5 16h5"/></>}
  {name==="card"&&<><rect {...line} x="3" y="6" width="18" height="13" rx="2"/><path {...line} d="M3 10h18M7 15h4"/></>}
  {name==="lock"&&<><rect {...line} x="6" y="10" width="12" height="10" rx="2"/><path {...line} d="M9 10V7a3 3 0 0 1 6 0v3M12 14v2"/></>}
  {name==="cash"&&<><path {...line} d="M3 7h18v11H3z"/><circle {...line} cx="12" cy="12.5" r="2.5"/><path {...line} d="M6 10h.01M18 15h.01"/></>}
  {name==="check"&&<><rect {...line} x="3" y="6" width="18" height="13" rx="2"/><path {...line} d="M3 10h18M7 15h4"/></>}
  {name==="phone"&&<path {...line} d="M7.5 3 11 7l-2 2.5a15 15 0 0 0 5.5 5.5l2.5-2 4 3.5-1.5 3a3 3 0 0 1-3.2 1.5C9.8 19.4 4.6 14.2 3 7.7A3 3 0 0 1 4.5 4.5z"/>}
 </svg>;
}
