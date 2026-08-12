export type MarkInvoicePaidIntent="action"|"read_only"|null;

const readOnly=/^\s*(?:is|did|has|have|was|were|when|what)\b/i;
const paymentStatus=/\b(?:pay|paid|payment status|still unpaid)\b/i;
const action=/^\s*(?:(?:please|kindly)\s+|(?:can|could|would|will)\s+you\s+(?:(?:please|kindly)\s+)?)?(?:(?:mark|set|record)\b.*\b(?:paid|as paid)\b|(?:they|he|she|customer)\s+paid\b.*\binvoice\b|(?:this|that|the)\s+invoice\s+has\s+been\s+paid\b)/i;

export function classifyMarkInvoicePaidIntent(input:string):MarkInvoicePaidIntent{
 const value=input.trim();
 if(!value)return null;
 if(readOnly.test(value)&&paymentStatus.test(value))return"read_only";
 return action.test(value)?"action":null;
}

export function explicitInvoiceNumber(input:string){return input.match(/\bINV[- ]?\d+\b/i)?.[0].replace(/\s+/g,"-").toUpperCase()??null;}
