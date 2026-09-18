import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import ts from "typescript";
import vm from "node:vm";

const source=readFileSync(new URL("../app/book/[businessSlug]/loadPublicBookingData.ts",import.meta.url),"utf8");
const compile=(value:string)=>ts.transpileModule(value.replace(/^import .*;\n/gm,""),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const settings={business_id:"business-1",enabled:true,public_slug:"test",businesses:{name:"Test Rentals",industry_profile:"service"}};

function loader(settingResults:Array<{data:any;error:any}>){
 let settingsCalls=0;
 const resultFor=(table:string)=>table==="booking_settings"?settingResults[Math.min(settingsCalls++,settingResults.length-1)]:table==="booking_availability"?{data:[],error:null}:table==="services"?{data:[],error:null}:{data:{},error:null};
 const db={from:(table:string)=>{
   const builder:any={select(){return builder;},ilike(){return builder;},eq(){return builder;},order(){return builder;},lt(){return builder;},gt(){return builder;},maybeSingle:async()=>resultFor(table),then(resolve:any,reject:any){return Promise.resolve(resultFor(table)).then(resolve,reject);}};
   return builder;
 },storage:{from:()=>({createSignedUrl:async()=>({data:null})})}};
 const cache=new Map<string,any>();
 const unstable_cache=(fn:any,keyParts:string[])=>async(...args:any[])=>{
   const key=`${keyParts.join(":")}:${JSON.stringify(args)}`;
   if(cache.has(key))return cache.get(key);
   const value=await fn(...args);
   cache.set(key,value);
   return value;
 };
 const context=vm.createContext({exports:{},getSupabaseAdmin:()=>db,unstable_cache,loadPromotionEligibility:async()=>({}),filterPromotionInventory:(value:any)=>value,stripePaymentsReady:()=>false,addDays:()=>"",dateInTimeZone:()=>"",zonedDateTimeToUtc:()=>new Date(),setTimeout:(fn:()=>void)=>fn(),console:{error:()=>{},info:()=>{}},Promise,Map,Symbol,Date,RegExp});
 vm.runInContext(compile(source),context);
 return {api:context.exports as {loadPublicBookingSettings:(slug:string)=>Promise<any>;loadPublicBookingData:(slug:string)=>Promise<any>},settingsCalls:()=>settingsCalls};
}

test("successful public booking data is cached",async()=>{
 const subject=loader([{data:settings,error:null}]);
 assert.equal((await subject.api.loadPublicBookingData("test")).businessName,"Test Rentals");
 await subject.api.loadPublicBookingData("test");
 assert.equal(subject.settingsCalls(),1);
});

test("PGRST303 retries once and a successful retry returns booking data",async()=>{
 const subject=loader([{data:null,error:{code:"PGRST303",message:"JWT issued at future"}},{data:settings,error:null}]);
 const data=await subject.api.loadPublicBookingData("test");
 assert.equal(data.businessName,"Test Rentals");
 assert.equal(subject.settingsCalls(),2);
});

test("failed and normal not-found settings results are not cached",async()=>{
 const failed=loader([{data:null,error:{code:"PGRST303",message:"JWT issued at future"}},{data:null,error:{code:"PGRST303",message:"JWT issued at future"}}]);
 assert.equal(await failed.api.loadPublicBookingSettings("test"),null);
 assert.equal(await failed.api.loadPublicBookingSettings("test"),null);
 assert.equal(failed.settingsCalls(),4);
 const missing=loader([{data:null,error:null}]);
 assert.equal(await missing.api.loadPublicBookingData("missing"),null);
 assert.equal(await missing.api.loadPublicBookingData("missing"),null);
 assert.equal(missing.settingsCalls(),2);
});
