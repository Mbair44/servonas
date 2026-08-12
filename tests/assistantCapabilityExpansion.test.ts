import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {classifyAssistantCapabilityIntent as classify} from "../lib/assistant/capabilityIntents.ts";
import {parseAppointmentCreateRequest} from "../lib/assistant/appointmentCreateIntent.ts";
import {requestsGlobalSchedule} from "../lib/assistant/selectedCustomerContext.ts";

const cases:[string,ReturnType<typeof classify>][]=[
 ["Create a customer named Mike Smith","customer_create"],
 ["Add Sarah Jones as a customer","customer_create"],
 ["Change their phone number","customer_update"],
 ["Add their email address","customer_update"],
 ["Schedule her tomorrow at 2","appointment_create"],
 ["Will you schedule him?","appointment_create"],
 ["Create a job for him","job_create"],
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

test("Assistant customer creation mirrors the working customer form and reports safe provider errors",async()=>{
 const code=await readFile(new URL("../lib/assistant/tools.ts",import.meta.url),"utf8");
 const section=code.slice(code.indexOf('name:"createCustomer"'),code.indexOf('name:"createAppointment"'));
 assert.match(section,/preferred_contact_method/);
 assert.match(section,/tags:\[\]/);
 assert.match(section,/customerWriteErrorMessage/);
 assert.match(section,/Assistant customer creation failed/);
 assert.doesNotMatch(section,/phone_normalized:/);
});

for(const phrase of ["Schedule Mike tomorrow at 2","Schedule him for tomorrow at 2","Will you schedule Mike Smith for tomorrow at 2","Book Sarah Friday at 10","Put John on my calendar tomorrow at 3","Create an appointment for Mike tomorrow","Add Mike to my schedule tomorrow at 2"]){
 test(`appointment creation outranks schedule lookup: ${phrase}`,()=>{assert.equal(classify(phrase),"appointment_create");assert.equal(requestsGlobalSchedule(phrase),false);});
}
for(const phrase of ["Who do I have tomorrow?","What appointments do I have tomorrow?","What do I have at 2?","Am I free tomorrow at 2?"]){
 test(`schedule read remains read only: ${phrase}`,()=>assert.notEqual(classify(phrase),"appointment_create"));
}
test("appointment parser never guesses AM or PM",()=>{const parsed=parseAppointmentCreateRequest("Schedule him tomorrow at 2","America/Phoenix",new Date("2026-08-12T12:00:00Z"));assert.equal(parsed?.needsMeridiem,true);assert.equal(parsed?.startsAt,null);});
test("appointment parser uses business timezone for an explicit meridiem",()=>{const parsed=parseAppointmentCreateRequest("Schedule him tomorrow at 2 PM","America/Phoenix",new Date("2026-08-12T12:00:00Z"));assert.equal(parsed?.startsAt,"2026-08-13T21:00:00.000Z");});
test("orchestrator gives appointment creation precedence before global schedule and provider",async()=>{const code=await readFile(new URL("../lib/assistant/orchestrator.ts",import.meta.url),"utf8");assert.match(code,/!isCreateCapability\(capabilityIntent\)&&markPaidIntent/);assert.match(code,/else if\(createDecision\)decision=createDecision;else if\(markPaidIntent/);assert.match(code,/selectCustomerConversationContext\(nextContext,toolResult\.selectedCustomerId\)/);});
