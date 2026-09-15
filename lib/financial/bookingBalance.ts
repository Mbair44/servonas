const cents=(value:number|null|undefined)=>Math.max(0,Math.round(Number(value)||0));

export function bookingBalanceForTotal(totalCents:number,amountPaidCents:number|null|undefined){
 const total=cents(totalCents),paid=cents(amountPaidCents);
 return{totalCents:total,balanceDueCents:Math.max(total-paid,0)};
}

export function jobFinancialTotalCents(input:{subtotal:number;taxAmount:number;discountAmount:number}){
 return cents((input.subtotal+input.taxAmount-input.discountAmount)*100);
}

export function bookingBalanceAfterDeliveryChange(input:{
 totalCents:number;
 amountPaidCents:number|null|undefined;
 oldDeliveryFeeCents:number;
 newDeliveryFeeCents:number;
 oldTaxCents:number;
 newTaxCents:number;
}){
 const totalCents=cents(input.totalCents)+cents(input.newDeliveryFeeCents)-cents(input.oldDeliveryFeeCents)+cents(input.newTaxCents)-cents(input.oldTaxCents);
 return bookingBalanceForTotal(totalCents,input.amountPaidCents);
}
