import type {ProviderDecision} from "./provider.ts";

const explicitCustomerChange=/\b(?:find|search(?: for)?|look up|show me|who is|switch to|change (?:the )?customer|select|choose|use)\b/i;
const outstandingIntent=/\b(?:owe|owes|owed|outstanding|overdue|balance|money due)\b/i;
const paymentHistoryIntent=/\b(?:payment history|payments? (?:made|received|recorded)|how (?:did|has) .* paid|when .* paid|ever paid|paid me|last payment|previous payments?)\b/i;
const appointmentIntent=/\b(?:appointment|appointments|scheduled|schedule|visit|visits|job|jobs|seeing|coming up)\b/i;
const globalScheduleIntent=/\b(?:who|what)\b.*\b(?:today|tomorrow|schedule|appointments?)\b|\b(?:schedule|appointments?)\b.*\b(?:today|tomorrow)\b/i;

export function explicitlyChangesCustomer(input:string){return explicitCustomerChange.test(input);}
export function explicitCustomerSearchTerm(input:string){const match=input.trim().match(/^(?:find|search(?: for)?|look up|show me|who is)\s+(?:customer\s+)?(.+?)[?.!]*$/i);return match?.[1]?.trim()||null;}
export function requestsGlobalSchedule(input:string){return globalScheduleIntent.test(input)&&!/(?:their|his|her|this customer|that customer)\b/i.test(input);}

export function bindTrustedSelectedCustomer(input:string,decision:ProviderDecision,customerId:string):ProviderDecision{
 if(explicitlyChangesCustomer(input))return decision;
 if(requestsGlobalSchedule(input))return decision;
 if(paymentHistoryIntent.test(input))return{toolName:"getPaymentHistory",arguments:{customerId},usage:decision.usage};
 if(outstandingIntent.test(input))return{toolName:"getOutstandingInvoices",arguments:{customerId},usage:decision.usage};
 if(appointmentIntent.test(input))return{toolName:"getCustomerAppointments",arguments:{customerId},usage:decision.usage};
 if("response" in decision)return paymentHistoryIntent.test(input)?{toolName:"getPaymentHistory",arguments:{customerId},usage:decision.usage}:outstandingIntent.test(input)?{toolName:"getOutstandingInvoices",arguments:{customerId},usage:decision.usage}:appointmentIntent.test(input)?{toolName:"getCustomer",arguments:{customerId},usage:decision.usage}:decision;
 if(decision.toolName==="searchCustomers")return paymentHistoryIntent.test(input)?{toolName:"getPaymentHistory",arguments:{customerId},usage:decision.usage}:outstandingIntent.test(input)?{toolName:"getOutstandingInvoices",arguments:{customerId},usage:decision.usage}:{toolName:"getCustomer",arguments:{customerId},usage:decision.usage};
 if(["getCustomer","getOutstandingInvoices","getPaymentHistory","searchInvoices","createAppointment","getSchedule"].includes(decision.toolName))return{...decision,arguments:{...decision.arguments,customerId}};
 return decision;
}

const invoiceActivityIntent=/\b(?:when|history|activity|created|sent|emailed|delivered|received|due|status|what happened|how many times)\b/i;
const deliveryWords=/\b(?:send|sent|resend|email|emailed|deliver|delivered|receive|received)\b/i;
const readOnlyDeliveryQuestion=/^\s*(?:when\s+(?:did|was)|did\s+(?:i|we|you|they)|was\s+(?:it|that|the)|has\s+(?:it|that|the)|how\s+many\s+times|what\s+(?:date|happened)|who|where|why)\b/i;
const explicitSendCommand=/^\s*(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+you\s+)?(?:send|resend|email)\b/i;
export type InvoiceSendIntent="explicit"|"read_only"|"ambiguous";
export function classifyInvoiceSendIntent(input:string):InvoiceSendIntent{if(readOnlyDeliveryQuestion.test(input)&&(deliveryWords.test(input)||/\bwhat happened\b/i.test(input)))return"read_only";if(explicitSendCommand.test(input))return"explicit";return"ambiguous";}
export function bindTrustedSelectedInvoice(input:string,decision:ProviderDecision,invoiceId:string):ProviderDecision{
 const deliveryIntent=classifyInvoiceSendIntent(input);
 if(deliveryIntent==="read_only")return{toolName:"getInvoiceActivity",arguments:{invoiceId},usage:decision.usage};
 if(deliveryIntent==="ambiguous"&&deliveryWords.test(input))return{response:"Do you want to see when the invoice was sent, or resend it?",usage:decision.usage};
 if("response" in decision){if(deliveryIntent==="explicit")return{toolName:"sendInvoice",arguments:{invoiceId},usage:decision.usage};if(paymentHistoryIntent.test(input))return{toolName:"getPaymentHistory",arguments:{invoiceId},usage:decision.usage};if(invoiceActivityIntent.test(input))return{toolName:"getInvoiceActivity",arguments:{invoiceId},usage:decision.usage};return decision;}
 if(["getPaymentHistory","getInvoiceActivity","sendInvoice","markInvoicePaid"].includes(decision.toolName))return{...decision,arguments:{...decision.arguments,invoiceId}};
 return decision;
}
