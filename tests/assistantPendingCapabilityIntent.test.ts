import test from "node:test";
import assert from "node:assert/strict";
import {classifyAssistantCapabilityIntent as classify} from "../lib/assistant/capabilityIntents.ts";
import {parseAppointmentCreateRequest,parseSchedulingFollowUp} from "../lib/assistant/appointmentCreateIntent.ts";
import {clearPendingCapability,pendingCapabilityFromContext,setPendingCapability} from "../lib/assistant/pendingCapabilityIntent.ts";

const now=new Date("2026-08-12T16:00:00Z");
test("incomplete appointment mutations retain create intent",()=>{for(const phrase of ["Schedule Mike","Will you schedule him?","Schedule Mike tomorrow","Schedule Mike at 2 PM"])assert.equal(classify(phrase),"appointment_create",phrase);});
test("job creation is a distinct mutation family",()=>{for(const phrase of ["Create a job for Mike","Make a job for him","Add a job for Sarah","Create an AC tune-up job for Mike","Set up a service call for Mike"])assert.equal(classify(phrase),"job_create",phrase);});
test("appointment parsing preserves partial date and time",()=>{const date=parseAppointmentCreateRequest("Schedule Mike tomorrow","America/Phoenix",now),time=parseAppointmentCreateRequest("Schedule Mike at 2 PM","America/Phoenix",now);assert.ok(date?.localDate);assert.equal(date?.localTime,null);assert.equal(time?.localDate,null);assert.equal(time?.localTime,"14:00");});
test("pending schedule follow-up collects date and time",()=>{const value=parseSchedulingFollowUp("Tomorrow at 2 PM","America/Phoenix",now);assert.ok(value?.localDate);assert.equal(value?.localTime,"14:00");assert.ok(value?.startsAt);});
test("pending capability is structured, expiring, and clearable",()=>{const pending={type:"appointment_create" as const,customerId:"11111111-1111-4111-8111-111111111111",collected:{},missing:["date","time"],originatingRequestId:"22222222-2222-4222-8222-222222222222",createdAt:new Date(now.getTime()-1000).toISOString()},context=setPendingCapability({},pending);assert.equal(pendingCapabilityFromContext(context,now.getTime())?.customerId,pending.customerId);assert.equal(pendingCapabilityFromContext(context,now.getTime()+31*60*1000),null);assert.equal(pendingCapabilityFromContext(clearPendingCapability(context),now.getTime()),null);});
test("read-only appointment question stays out of create intent",()=>assert.notEqual(classify("Does Mike have an appointment?"),"appointment_create"));
