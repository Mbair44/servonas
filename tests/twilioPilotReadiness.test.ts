import assert from "node:assert/strict";
import test from "node:test";
import {verifyTwilioChain,campaignApproved,type Chain} from "../lib/twilio/liveReadiness.ts";
const chain:Chain={parentSid:"ACparent",accountSid:"ACtenant",brandSid:"BNbrand",profileSid:"BUprofile",trustSid:"BUtrust",serviceSid:"MGservice",campaignSid:"QEcampaign",phoneSid:"PNphone",phone:"+14805550123",inboundUrl:"https://servonas.com/api/twilio/inbound",statusUrl:"https://servonas.com/api/twilio/tenant-message-status"};
function fixture(){return [
 {sid:chain.accountSid,owner_account_sid:chain.parentSid,status:"active"},
 {sid:chain.brandSid,account_sid:chain.parentSid,status:"APPROVED",customer_profile_bundle_sid:chain.profileSid,a2p_profile_bundle_sid:chain.trustSid,mock:false},
 {sid:chain.serviceSid,account_sid:chain.accountSid,use_inbound_webhook_on_number:false,inbound_request_url:chain.inboundUrl,inbound_method:"POST",status_callback:chain.statusUrl},
 {sid:chain.campaignSid,account_sid:chain.accountSid,brand_registration_sid:chain.brandSid,messaging_service_sid:chain.serviceSid,campaign_status:"VERIFIED",mock:false},
 {sid:chain.phoneSid,account_sid:chain.accountSid,phone_number:chain.phone,capabilities:{sms:true},sms_url:chain.inboundUrl,sms_method:"POST"},
 {sid:chain.phoneSid,account_sid:chain.accountSid,phone_number:chain.phone,service_sid:chain.serviceSid}
 ] as Record<string,unknown>[];}
async function verify(rows=fixture()){
 const client={async request<T>(url:string,init?:RequestInit):Promise<T>{assert.equal(init,undefined,"verification never mutates resources");const i=url.includes("BrandRegistrations")?1:url.includes("Compliance/Usa2p")?3:url.includes("IncomingPhoneNumbers")?4:url.includes("/PhoneNumbers/")?5:url.includes("/Services/")?2:0;return rows[i] as T;}};
 return verifyTwilioChain(chain,client,client);
}
test("ready requires the complete live chain and the raw campaign_status field",async()=>{
 assert.equal((await verify()).state,"ready");assert.equal(campaignApproved("VERIFIED"),true);assert.equal(campaignApproved("APPROVED"),false);
 const rows=fixture();delete rows[3].campaign_status;rows[3].status="VERIFIED";assert.equal((await verify(rows)).state,"compliance_pending");
});
test("unapproved Brand or campaign cannot activate a tenant",async()=>{
 for(const [i,key,value] of [[1,"status","PENDING"],[3,"campaign_status","IN_PROGRESS"],[3,"campaign_status","FAILED"]] as const){const rows=fixture();rows[i][key]=value;assert.notEqual((await verify(rows)).state,"ready");}
});
test("wrong account, Brand, Service, phone or mock resource fails closed",async()=>{
 for(const [i,key,value] of [[0,"owner_account_sid","ACother"],[1,"customer_profile_bundle_sid","BUother"],[2,"account_sid","ACother"],[3,"messaging_service_sid","MGother"],[3,"brand_registration_sid","BNother"],[4,"phone_number","+16025550123"],[5,"service_sid","MGother"],[3,"mock",true]] as const){const rows=fixture();rows[i][key]=value;assert.equal((await verify(rows)).state,"error");}
});
test("non-SMS numbers, wrong webhook URLs/methods and absent callbacks are blocked",async()=>{
 for(const [i,key,value] of [[4,"capabilities",{sms:false}],[2,"inbound_request_url","https://other.example/inbound"],[2,"inbound_method","GET"],[2,"status_callback",""]] as const){const rows=fixture();rows[i][key]=value;assert.equal((await verify(rows)).state,"error");}
 const rows=fixture();rows[2].use_inbound_webhook_on_number=true;rows[4].sms_url="https://other.example";assert.equal((await verify(rows)).state,"error");
});
test("bad Vault credentials or unavailable resources cannot be ready",async()=>{
 const client={async request<T>():Promise<T>{throw new Error("Twilio request failed (401).");}};
 assert.equal((await verifyTwilioChain(chain,client,client)).state,"error");
});
