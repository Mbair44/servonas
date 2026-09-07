export type RentalCompletionBalanceInput={
 subtotalCents?:number|null;
 totalCents:number|null;
 discountCents:number|null;
 amountPaidCents:number|null;
 balanceDueCents?:number|null;
};

const cents=(value:number|null|undefined)=>Math.max(0,Math.round(Number(value)||0));

export function rentalCompletionBalance(input:RentalCompletionBalanceInput){
 const totalCents=cents(input.totalCents);
 const discountCents=Math.min(cents(input.discountCents),cents(input.subtotalCents??totalCents+cents(input.discountCents)));
 const subtotalCents=Math.max(totalCents+discountCents,cents(input.subtotalCents));
 const amountPaidCents=Math.min(totalCents,cents(input.amountPaidCents));
 const calculatedBalance=Math.max(0,totalCents-amountPaidCents);
 const storedBalance=input.balanceDueCents==null?calculatedBalance:cents(input.balanceDueCents);
 return{subtotalCents,totalCents,discountCents,amountPaidCents,balanceDueCents:Math.min(calculatedBalance,storedBalance)};
}
