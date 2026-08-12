export type AssistantCapabilityIntent=
 | "customer_create"|"customer_update"|"appointment_create"|"appointment_reschedule"
 | "job_create"|"job_complete"|"job_note"|"invoice_create"|"customer_message"|"next_customer_message"
 | "schedule_summary"|null;

/** Strong, centralized action families. Ambiguous requests intentionally fall through to the provider. */
export function classifyAssistantCapabilityIntent(input:string):AssistantCapabilityIntent{
 const value=input.toLowerCase().replace(/[?.!,]+/g," ").replace(/\s+/g," ").trim();
 if(/\b(text|message|tell)\s+(my\s+)?next\s+(customer|appointment)\b/.test(value))return "next_customer_message";
 if(/\b(text|message)\b/.test(value)&&/\b(customer|them|him|her|sarah|john|mike)\b/.test(value))return "customer_message";
 if(/\b(mark|close|finish|complete)\b.*\b(job|it)\b|\b(this|that)\s+job\s+is\s+done\b/.test(value))return "job_complete";
 if(/\b(add|make)\s+(a\s+)?note\b|\bnote\s+that\b/.test(value))return "job_note";
 if(/\b(reschedule|move|push)\b.*\b(appointment|job|them|him|her|it|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/.test(value))return "appointment_reschedule";
 if(/\b(?:create|make|add|set up)\s+(?:an?\s+)?(?:[a-z0-9 -]+\s+)?(?:job|service call)\b/.test(value))return "job_create";
 if(/\b(?:schedule|book)\b(?:\s+\w+){0,8}$|\bput\b.+\b(?:calendar|schedule)\b|\bcreate\s+an?\s+appointment\b/.test(value))return "appointment_create";
 if(/\b(create|add)\s+(a\s+)?customer\b|\badd\b.+\bas\s+(a\s+)?customer\b/.test(value))return "customer_create";
 if(/\b(change|update|add)\b.*\b(phone|email|address|customer note|their note)\b/.test(value))return "customer_update";
 if(/\b(create\s+an?\s+invoice|invoice\s+(this|that|the|them|him|her)|bill\s+(this|that|them|him|her))\b/.test(value))return "invoice_create";
 if(/\b(who['’]?s next|what do i have left|what['’]?s after|day look like|need to collect today)\b/.test(value))return "schedule_summary";
 return null;
}
