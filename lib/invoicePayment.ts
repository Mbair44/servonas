export type InvoicePaymentPurpose="balance"|"deposit"|"partial";

export class InvoicePaymentAmountError extends Error{
  constructor(message:string){super(message);this.name="InvoicePaymentAmountError";}
}

export function invoicePaymentAmount(input:{
  purpose:InvoicePaymentPurpose;
  balanceDueCents:number;
  depositRequiredCents:number;
  netPaidCents:number;
  allowPartialPayments:boolean;
  minimumPartialPaymentCents:number;
  requestedPartialCents?:number|null;
}){
  const balance=Math.trunc(input.balanceDueCents);
  if(!Number.isSafeInteger(balance)||balance<=0)throw new InvoicePaymentAmountError("This invoice has no balance due.");
  if(input.purpose==="balance")return balance;
  if(input.purpose==="deposit"){
    const remaining=Math.min(balance,Math.max(0,Math.trunc(input.depositRequiredCents)-Math.trunc(input.netPaidCents)));
    if(remaining<=0)throw new InvoicePaymentAmountError("The required deposit has already been paid.");
    return remaining;
  }
  if(!input.allowPartialPayments)throw new InvoicePaymentAmountError("Partial payments are not enabled for this invoice.");
  const requested=input.requestedPartialCents;
  if(!Number.isSafeInteger(requested)||!requested||requested<Math.max(50,Math.trunc(input.minimumPartialPaymentCents))){
    throw new InvoicePaymentAmountError(`Enter at least $${(Math.max(50,input.minimumPartialPaymentCents)/100).toFixed(2)}.`);
  }
  if(requested>balance)throw new InvoicePaymentAmountError("The payment cannot exceed the balance due.");
  return requested;
}
