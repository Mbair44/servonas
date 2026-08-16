import type {ReactNode} from "react";

const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);

export function RentalPricingFooter({priceCents,rentalHours,multiDayMessage,unitSuffix,action}:{priceCents:number;rentalHours:number;multiDayMessage?:string|null;unitSuffix?:string;action:ReactNode}){
 return <footer className="rental-pricing-footer">
  <div className="rental-pricing-price"><strong>{priceCents>0?money(priceCents):"Contact for price"}</strong>{priceCents>0&&<small>Up to {rentalHours}-hour rental{unitSuffix??""}</small>}</div>
  {priceCents>0&&multiDayMessage&&<div className="rental-pricing-multiday"><span aria-hidden="true">✓</span><small>{multiDayMessage}</small></div>}
  <div className="rental-pricing-divider" aria-hidden="true"/>
  {action}
 </footer>;
}
