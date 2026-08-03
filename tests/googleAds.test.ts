import assert from "node:assert/strict";
import test from "node:test";
import {GOOGLE_ADS_SIGNUP_CONVERSION,trackGoogleAdsConversion,trackGoogleAdsSignupConversion} from "../lib/googleAds.ts";

function browserWindow(gtag?: (...args:unknown[])=>void){
 const values=new Map<string,string>();
 return {gtag,sessionStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}};
}

test("signup conversion uses the configured Google Ads destination",()=>{
 assert.equal(GOOGLE_ADS_SIGNUP_CONVERSION,"AW-18340749438/-fjTCKncxtscEP7AxqlE");
});

test("signup conversion fires once for a confirmed Supabase user",()=>{
 const calls:unknown[][]=[];
 Object.defineProperty(globalThis,"window",{value:browserWindow((...args)=>calls.push(args)),configurable:true});
 assert.equal(trackGoogleAdsSignupConversion("user-1"),true);
 assert.equal(trackGoogleAdsSignupConversion("user-1"),false);
 assert.deepEqual(calls,[["event","conversion",{send_to:"AW-18340749438/-fjTCKncxtscEP7AxqlE"}]]);
 Reflect.deleteProperty(globalThis,"window");
});

test("unavailable Google tag never throws or marks a conversion sent",()=>{
 Object.defineProperty(globalThis,"window",{value:browserWindow(),configurable:true});
 assert.equal(trackGoogleAdsConversion("AW-test","missing"),false);
 Reflect.deleteProperty(globalThis,"window");
});
