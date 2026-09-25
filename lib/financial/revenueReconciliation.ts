export type ReconciliationPayment={id:string;provider:"stripe"|"offline";status:string;amountCents:number;refundedCents:number;refundLedgerCents?:number;stripeReference?:string|null;method?:string|null};
export type ReconciliationInvoice={id:string;status:string;totalCents:number;balanceCents:number};
export type ReconciliationBooking={id:string;status:string;totalCents:number;amountPaidCents:number;balanceDueCents:number;stripePaymentIntentId?:string|null;stripeCheckoutSessionId?:string|null;scheduledChargeAt?:string|null;jobStatus?:string|null;payments:ReconciliationPayment[];invoices:ReconciliationInvoice[]};
export type ReconciliationIssue={code:string;message:string};
export type ReconciliationResult={expectedCents:number;collectedCents:number;stripeCollectedCents:number;manualCollectedCents:number;refundedCents:number;outstandingCents:number;differenceCents:number;status:"reconciled"|"outstanding_expected"|"needs_review"|"overpaid"|"stripe_mismatch"|"refund_mismatch";issues:ReconciliationIssue[]};
const activePayment=(payment:ReconciliationPayment)=>["succeeded","partially_refunded","refunded"].includes(payment.status);
const canceled=(status:string)=>["cancelled","canceled","expired","refunded"].includes(status);
export function reconcileBooking(input:ReconciliationBooking):ReconciliationResult{
 const payments=input.payments.filter(activePayment),ledgerGross=payments.reduce((sum,p)=>sum+p.amountCents,0),refundedCents=payments.reduce((sum,p)=>sum+p.refundedCents,0),ledgerNet=ledgerGross-refundedCents;
 const useBookingSnapshot=!payments.length, collectedCents=useBookingSnapshot?Math.max(0,input.amountPaidCents-refundedCents):ledgerNet;
 const stripeCollectedCents=(useBookingSnapshot&&input.stripePaymentIntentId?collectedCents:0)+payments.filter(p=>p.provider==="stripe").reduce((sum,p)=>sum+p.amountCents-p.refundedCents,0);
 const manualCollectedCents=payments.filter(p=>p.provider==="offline").reduce((sum,p)=>sum+p.amountCents-p.refundedCents,0);
 const outstandingCents=Math.max(0,input.balanceDueCents),differenceCents=input.totalCents-collectedCents-outstandingCents,issues:ReconciliationIssue[]=[];
 if(canceled(input.status)&&outstandingCents>0)issues.push({code:"canceled_balance",message:"Canceled booking still has a collectible balance."});
 if(payments.length&&input.amountPaidCents!==ledgerNet)issues.push({code:"ledger_mismatch",message:"Booking amount paid does not agree with its payment ledger."});
 if(payments.some(p=>p.provider==="stripe"&&!p.stripeReference))issues.push({code:"stripe_reference_missing",message:"Stripe payment is missing a stored Stripe reference."});
 if(payments.some(p=>p.refundLedgerCents!=null&&p.refundLedgerCents!==p.refundedCents))issues.push({code:"refund_mismatch",message:"Payment refund total does not agree with its refund records."});
 const seen=new Set<string>();if(payments.some(p=>p.provider==="stripe"&&p.stripeReference&&(seen.has(p.stripeReference)||!seen.add(p.stripeReference))))issues.push({code:"duplicate_stripe",message:"Multiple payment records use the same Stripe transaction."});
 if(input.invoices.some(i=>!['void','refunded'].includes(i.status)&&i.totalCents!==input.totalCents))issues.push({code:"invoice_total_mismatch",message:"Active invoice total differs from booking total."});
 if(input.balanceDueCents===0&&input.scheduledChargeAt)issues.push({code:"scheduled_charge_active",message:"Zero-balance booking still has a scheduled charge."});
 if(input.jobStatus==="completed"&&outstandingCents>0)issues.push({code:"completed_unpaid",message:"Completed rental still has an unpaid balance."});
 if(differenceCents!==0)issues.push({code:differenceCents<0?"overpayment":"booking_math",message:differenceCents<0?"Collected amount exceeds the booking total.":"Booking total does not equal collected plus outstanding."});
 const status=issues.some(i=>i.code==="overpayment")?"overpaid":issues.some(i=>i.code.startsWith("stripe_" )||i.code==="duplicate_stripe")?"stripe_mismatch":issues.some(i=>i.code==="refund_mismatch")?"refund_mismatch":issues.length?"needs_review":outstandingCents>0?"outstanding_expected":"reconciled";
 return {expectedCents:input.totalCents,collectedCents,stripeCollectedCents,manualCollectedCents,refundedCents,outstandingCents,differenceCents,status,issues};
}
export function reconciliationSummary(rows:ReconciliationResult[]){return rows.reduce((total,row)=>({expectedCents:total.expectedCents+row.expectedCents,collectedCents:total.collectedCents+row.collectedCents,refundedCents:total.refundedCents+row.refundedCents,outstandingCents:total.outstandingCents+row.outstandingCents,differenceCents:total.differenceCents+row.differenceCents,issues:total.issues+(row.issues.length?1:0)}),{expectedCents:0,collectedCents:0,refundedCents:0,outstandingCents:0,differenceCents:0,issues:0});}
