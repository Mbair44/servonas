import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {StripeTaxSettingsSyncError,stripeTaxHeadOfficeAddress,syncConnectedStripeTaxSettings} from "../lib/stripeTaxSettings.ts";

const business={address_line1:"1925 S Rock Ct",address_line2:"Suite 4",city:"Gilbert",state:"AZ",postal_code:"85295"};

test("maps the canonical business address to Stripe Tax head office format",()=>{
 assert.deepEqual(stripeTaxHeadOfficeAddress(business),{line1:"1925 S Rock Ct",line2:"Suite 4",city:"Gilbert",state:"AZ",postal_code:"85295",country:"US"});
});

test("syncs and reads Tax settings in the connected-account context",async()=>{
 const calls:unknown[][]=[];
 const stripe={tax:{settings:{update:async(params:unknown,options:unknown)=>{calls.push(["update",params,options]);return {};},retrieve:async(params:unknown,options:unknown)=>{calls.push(["retrieve",params,options]);return {status:"active",status_details:{active:{}},head_office:{address:{state:"AZ",postal_code:"85295"}},livemode:true};}}}} as never;
 const result=await syncConnectedStripeTaxSettings({businessId:"business-a",accountId:"acct_connected",business,stripe});
 assert.deepEqual(calls,[["update",{head_office:{address:{line1:"1925 S Rock Ct",line2:"Suite 4",city:"Gilbert",state:"AZ",postal_code:"85295",country:"US"}}},{stripeAccount:"acct_connected"}],["retrieve",{},{stripeAccount:"acct_connected"}]]);
 assert.deepEqual(result,{accountId:"acct_connected",status:"active",missingFields:[],headOfficeState:"AZ",headOfficePostalCode:"85295",livemode:true});
});

test("missing account or incomplete address fails clearly without Stripe calls",async()=>{
 await assert.rejects(syncConnectedStripeTaxSettings({businessId:"business-a",accountId:null,business}),error=>error instanceof StripeTaxSettingsSyncError&&error.code==="missing_connected_account");
 assert.throws(()=>stripeTaxHeadOfficeAddress({...business,address_line1:null}),error=>error instanceof StripeTaxSettingsSyncError&&error.code==="incomplete_business_address");
});

test("Stripe failure returns a safe actionable error",async()=>{
 const stripe={tax:{settings:{update:async()=>{throw Error("provider unavailable");},retrieve:async()=>{throw Error("must not read");}}}} as never;
 await assert.rejects(syncConnectedStripeTaxSettings({businessId:"business-a",accountId:"acct_connected",business,stripe}),error=>error instanceof StripeTaxSettingsSyncError&&error.code==="provider_error");
});

test("settings actions scope Stripe Tax synchronization to the authorized workspace",async()=>{
 const source=await readFile(new URL("../app/app/[businessSlug]/settings/actions.ts",import.meta.url),"utf8");
 assert.match(source,/requireWorkspaceCapability\(slug,"business_onboarding"\)/);
 assert.match(source,/\.eq\("business_id",business\.id\)\.eq\("provider","stripe"\)/);
 assert.match(source,/syncConnectedStripeTaxSettings\(\{businessId:business\.id/);
});
