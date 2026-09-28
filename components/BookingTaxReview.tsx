"use client";
import {useEffect,useRef} from 'react';
export type BookingFinalQuote={subtotalCents:number;discountCents:number;deliveryFeeCents:number;taxCents:number;totalCents:number;depositCents:number;remainingBalanceCents:number;displayMode:'inclusive'|'exclusive'};
export function BookingTaxReview({quote,onConfirm,onCancel}:{quote:BookingFinalQuote;onConfirm:()=>void;onCancel:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>previous?.focus();},[]);
 const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
 const rows:[string,number][]=[['Rentals',quote.subtotalCents],['Discount',-quote.discountCents],['Delivery',quote.deliveryFeeCents],[quote.displayMode==='inclusive'?'Included sales tax':'Sales tax',quote.taxCents],['Total',quote.totalCents],['Due today',quote.depositCents],['Remaining balance',quote.remainingBalanceCents]];
 return <dialog ref={ref} className="date-pricing-dialog" aria-labelledby="booking-final-price-title" onCancel={event=>{event.preventDefault();onCancel();}}><h2 id="booking-final-price-title">Review your final booking total</h2><dl>{rows.map(([label,value])=><div className="summary-line" key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl><p>{quote.depositCents>0?`You authorize ${money(quote.depositCents)} today and the remaining ${money(quote.remainingBalanceCents)} according to your booking payment terms.`:'The business will arrange payment for this booking.'}</p><div className="rental-party-actions"><button type="button" className="button secondary" onClick={onCancel}>Back</button><button type="button" className="button" onClick={onConfirm}>{quote.depositCents>0?`Reserve for ${money(quote.depositCents)}`:'Confirm booking · Invoice later'}</button></div></dialog>;
}
