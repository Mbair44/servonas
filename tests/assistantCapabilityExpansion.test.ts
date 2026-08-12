import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {classifyAssistantCapabilityIntent as classify} from "../lib/assistant/capabilityIntents.ts";

const cases:[string,ReturnType<typeof classify>][]=[
 ["Create a customer named Mike Smith","customer_create"],
 ["Add Sarah Jones as a customer","customer_create"],
 ["Change their phone number","customer_update"],
 ["Add their email address","customer_update"],
 ["Schedule her tomorrow at 2","appointment_create"],
 ["Put them on the calendar Thursday at 4","appointment_create"],
 ["Move this appointment to next Monday","appointment_reschedule"],
 ["Push them back an hour","appointment_reschedule"],
 ["Mark this job complete","job_complete"],
 ["This job is done","job_complete"],
 ["Add a note that the gate code is 1824","job_note"],
 ["Note that the customer has a dog","job_note"],
 ["Create an invoice for $350","invoice_create"],
 ["Bill them $500","invoice_create"],
 ["Text this customer that I am late","customer_message"],
 ["Text my next customer that I am 15 minutes away","next_customer_message"],
 ["What do I have left today?","schedule_summary"],
 ["Who’s next?","schedule_summary"],
];
for(const [phrase,intent] of cases)test(`classifies ${phrase}`,()=>assert.equal(classify(phrase),intent));

test("ambiguous language remains provider-routed",()=>assert.equal(classify("Can you help me with Mike?"),null));

test("expanded tools preserve tenant, permission, and trusted-context guards",async()=>{
 const code=await readFile(new URL("../lib/assistant/tools.ts",import.meta.url),"utf8");
 for(const name of ["updateCustomer","completeJob","createInvoice","sendCustomerMessage","getScheduleSummary"])assert.match(code,new RegExp(`name:\"${name}\"`));
 assert.match(code,/eq\("business_id",c\.business\.id\)/);
 assert.match(code,/requireSelectedJobMatch/);
 assert.match(code,/requireSelectedCustomerMatch/);
 assert.match(code,/sms_consent_status===\"opted_out\"/);
 assert.match(code,/sendTenantTwilioMessage/);
 assert.doesNotMatch(code,/getTwilioCredentials/);
});

test("completion uses the shared workflow and preserves downstream behavior",async()=>{
 const code=await readFile(new URL("../lib/jobs/completeJob.ts",import.meta.url),"utf8");
 assert.match(code,/canTransitionJob/);
 assert.match(code,/JobNotificationService\.jobCompleted/);
 assert.match(code,/JobNotificationService\.reviewRequest/);
 assert.match(code,/processCompletedJobBilling/);
});

test("invoice creation stays draft and never sends or charges",async()=>{
 const code=await readFile(new URL("../lib/assistant/tools.ts",import.meta.url),"utf8");
 const section=code.slice(code.indexOf('name:"createInvoice"'),code.indexOf('name:"sendCustomerMessage"'));
 assert.match(section,/status:\"draft\"/);
 assert.match(section,/typeof a\.taxable!==\"boolean\"/);
 assert.doesNotMatch(section,/sendInvoiceFinancialEmail\(|stripeClient\(|\.charges?\./);
});

test("tenant SMS is idempotent and has no legacy fallback",async()=>{
 const code=await readFile(new URL("../lib/assistant/tools.ts",import.meta.url),"utf8");
 const section=code.slice(code.indexOf('name:"sendCustomerMessage"'),code.indexOf('name:"getScheduleSummary"'));
 assert.match(section,/ai_action_requests/);
 assert.match(section,/idempotency_key:key/);
 assert.match(section,/Tenant Twilio sender is not active/);
});
