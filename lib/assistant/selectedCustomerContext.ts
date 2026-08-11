import type {ProviderDecision} from "./provider.ts";

const explicitCustomerChange=/\b(?:find|search(?: for)?|look up|switch to|change (?:the )?customer|select|choose|use)\b/i;
const financialIntent=/\b(?:owe|owes|owed|outstanding|overdue|balance|invoice|money|paid|payment)\b/i;
const appointmentIntent=/\b(?:appointment|appointments|scheduled|schedule|visit|visits)\b/i;

export function explicitlyChangesCustomer(input:string){return explicitCustomerChange.test(input);}

export function bindTrustedSelectedCustomer(input:string,decision:ProviderDecision,customerId:string):ProviderDecision{
 if(explicitlyChangesCustomer(input))return decision;
 if("response" in decision)return financialIntent.test(input)?{toolName:"getOutstandingInvoices",arguments:{customerId},usage:decision.usage}:appointmentIntent.test(input)?{toolName:"getCustomer",arguments:{customerId},usage:decision.usage}:decision;
 if(decision.toolName==="searchCustomers")return financialIntent.test(input)?{toolName:"getOutstandingInvoices",arguments:{customerId},usage:decision.usage}:{toolName:"getCustomer",arguments:{customerId},usage:decision.usage};
 if(["getCustomer","getOutstandingInvoices","searchInvoices","createAppointment","getSchedule"].includes(decision.toolName))return{...decision,arguments:{...decision.arguments,customerId}};
 return decision;
}
