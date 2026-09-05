import assert from "node:assert/strict";
import test from "node:test";
import {confirmGoogleAdsAdGroupCreation,createGoogleAdsAdGroupsIndividually,GoogleAdsAdGroupCreationError} from "../lib/googleAdsAdGroupCreation.ts";

const mutation={adGroupId:"456",adGroupResourceName:"customers/123/adGroups/456",googleRequestId:"request-1"};

test("successful Google Ads creation requires a returned resource and read-back",async()=>{
 const result=await confirmGoogleAdsAdGroupCreation({mutate:async()=>mutation,verify:async created=>({id:created.adGroupId,name:"Bounce House Rentals"})});
 assert.equal(result.mutation.adGroupId,"456");
 assert.deepEqual(result.verification,{id:"456",name:"Bounce House Rentals"});
});

test("Google mutation errors remain failures",async()=>{
 const failure=Object.assign(new Error("Google rejected the ad group"),{requestId:"google-request-2",status:400});
 await assert.rejects(()=>confirmGoogleAdsAdGroupCreation({mutate:async()=>{throw failure;},verify:async()=>({})}),error=>error===failure);
});

test("a mutation response without a resource name is rejected",async()=>{
 await assert.rejects(()=>confirmGoogleAdsAdGroupCreation({mutate:async()=>({...mutation,adGroupResourceName:null}),verify:async()=>({})}),error=>error instanceof GoogleAdsAdGroupCreationError&&error.stage==="mutation_no_resource"&&error.googleRequestId==="request-1");
});

test("a local draft does not become success when Google creation fails",async()=>{
 let localDraftSaved=false,successReported=false;
 localDraftSaved=true;
 await assert.rejects(async()=>{await confirmGoogleAdsAdGroupCreation({mutate:async()=>{throw new Error("mutation failed");},verify:async()=>({})});successReported=true;});
 assert.equal(localDraftSaved,true);
 assert.equal(successReported,false);
});

test("read-back verification failure rejects an accepted mutation",async()=>{
 await assert.rejects(()=>confirmGoogleAdsAdGroupCreation({mutate:async()=>mutation,verify:async()=>null}),error=>error instanceof GoogleAdsAdGroupCreationError&&error.stage==="verification");
});

test("multiple ad groups report individual successes and failures",async()=>{
 const results=await createGoogleAdsAdGroupsIndividually(["Bounce Houses","Water Slides","Mechanical Bulls"],async name=>{if(name==="Water Slides")throw new Error("policy rejected");return {name};});
 assert.deepEqual(results.map(result=>result.ok),[true,false,true]);
 assert.equal(results[1].item,"Water Slides");
 assert.match(String(results[1].error),/policy rejected/);
});
