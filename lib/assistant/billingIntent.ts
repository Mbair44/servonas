export type BillingIntentFamily="outstanding_invoices_global"|"outstanding_invoices_customer"|"invoice_status"|null;

const outstandingLanguage=/\b(?:unpaid|outstanding|overdue|open invoices?|owe|owes|owed|owing|money due|balance due|still due|not paid|hasn['’]?t paid|haven['’]?t been paid)\b/i;
const invoiceLanguage=/\b(?:invoice|invoices|bill|bills|money|balance|paid|pay)\b/i;
const selectedCustomerReference=/\b(?:this|that) customer\b|\b(?:he|him|his|she|her|hers|they|them|their|theirs)\b/i;
const selectedInvoiceReference=/\b(?:this|that|the) invoice\b|\binvoice\s+(?:#\s*)?(?:inv[- ]?)?[a-z0-9-]+\b/i;
const specificInvoiceStatus=/\b(?:is|was|has)\b.*\b(?:invoice|it)\b.*\bpaid\b|\b(?:invoice|it)\b.*\b(?:paid|payment status)\b/i;
const globalSubject=/\b(?:do|did)\s+(?:i|we)\s+have\b|\b(?:who|anyone|what customers?|which customers?)\b|\bhow much\b.*\b(?:i|we|me|us)\b|\bhow much (?:is|remains|was)\b|\bwhat(?:'s| is) still\b/i;
const namedCustomer=/^(?:does|did|has|what(?: unpaid| outstanding)? invoices? does)\s+(?!this\b|that\b)([a-z][a-z .'-]{1,80}?)\s+(?:owe|have|owed|paid)\b/i;

export function classifyBillingIntent(input:string):BillingIntentFamily{
 const value=input.trim();
 if(selectedInvoiceReference.test(value)&&specificInvoiceStatus.test(value))return"invoice_status";
 if(!outstandingLanguage.test(value)&&!(/\bhasn['’]?t paid\b/i.test(value)&&invoiceLanguage.test(value)))return null;
 if(selectedCustomerReference.test(value)||namedCustomer.test(value))return"outstanding_invoices_customer";
 if(globalSubject.test(value)||invoiceLanguage.test(value))return"outstanding_invoices_global";
 return null;
}
