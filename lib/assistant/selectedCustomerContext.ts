import type {ProviderDecision} from "./provider.ts";

const explicitCustomerChange=/\b(?:find|search(?: for)?|look up|switch to|change (?:the )?customer|select|choose|use)\b/i;
const outstandingIntent=/\b(?:owe|owes|owed|outstanding|overdue|balance|money due)\b/i;
const paymentHistoryIntent=/\b(?:payment history|payments? (?:made|received|recorded)|how (?:did|has) .* paid|when .* paid|last payment|previous payments?)\b/i;
const appointmentIntent=/\b(?:appointment|appointments|scheduled|schedule|visit|visits)\b/i;

export function explicitlyChangesCustomer(input:string){return explicitCustomerChange.test(input);}

export function bindTrustedSelectedCustomer(input:string,decision:ProviderDecision,customerId:string):ProviderDecision{
 if(explicitlyChangesCustomer(input))return decision;
 if("response" in decision)return paymentHistoryIntent.test(input)?{toolName:"getPaymentHistory",arguments:{customerId},usage:decision.usage}:outstandingIntent.test(input)?{toolName:"getOutstandingInvoices",arguments:{customerId},usage:decision.usage}:appointmentIntent.test(input)?{toolName:"getCustomer",arguments:{customerId},usage:decision.usage}:decision;
 if(decision.toolName==="searchCustomers")return paymentHistoryIntent.test(input)?{toolName:"getPaymentHistory",arguments:{customerId},usage:decision.usage}:outstandingIntent.test(input)?{toolName:"getOutstandingInvoices",arguments:{customerId},usage:decision.usage}:{toolName:"getCustomer",arguments:{customerId},usage:decision.usage};
 if(["getCustomer","getOutstandingInvoices","getPaymentHistory","searchInvoices","createAppointment","getSchedule"].includes(decision.toolName))return{...decision,arguments:{...decision.arguments,customerId}};
 return decision;
}

const invoiceActivityIntent=/\b(?:when|history|activity|created|sent|due|status|what happened)\b/i;
const sendInvoiceIntent=/\b(?:send|resend|email)\b.*\binvoice\b|\binvoice\b.*\b(?:send|resend|email)\b/i;
export function bindTrustedSelectedInvoice(input:string,decision:ProviderDecision,invoiceId:string):ProviderDecision{
 if("response" in decision){if(sendInvoiceIntent.test(input))return{toolName:"sendInvoice",arguments:{invoiceId},usage:decision.usage};if(paymentHistoryIntent.test(input))return{toolName:"getPaymentHistory",arguments:{invoiceId},usage:decision.usage};if(invoiceActivityIntent.test(input))return{toolName:"getInvoiceActivity",arguments:{invoiceId},usage:decision.usage};return decision;}
 if(["getPaymentHistory","getInvoiceActivity","sendInvoice","markInvoicePaid"].includes(decision.toolName))return{...decision,arguments:{...decision.arguments,invoiceId}};
 return decision;
}
