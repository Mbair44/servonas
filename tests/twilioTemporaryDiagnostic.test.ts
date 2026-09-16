import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import ts from "typescript";
import {renderToStaticMarkup} from "react-dom/server";
import {isServonasPlatformAdmin} from "../lib/platformAccess.ts";

const require=createRequire(import.meta.url);
const source=readFileSync(new URL("../app/app/admin/twilio/TemporaryDiagnostic.tsx",import.meta.url),"utf8");
const account="fake-tenant-account-not-a-twilio-sid",brand="BN6de154c8ebffa68df5e874630d4846dd",service="MG75c5f096e1531a4bfd072ecb405244f8",product="BU"+"a".repeat(32);
const campaign={sid:"QE"+"b".repeat(32),brand_registration_sid:brand,messaging_service_sid:service,campaign_id:"CKZW1Z5",campaign_status:"VERIFIED",auth_token:"NEVER_OUTPUT",email:"PRIVATE"};
function fixture(user:unknown={email:"admin@servonas.com",email_confirmed_at:"confirmed"},failTrust=false,missingAccount=false){
 const calls:string[]=[],vaultCalls:unknown[]=[],accountReads:string[]=[];
 const context=vm.createContext({exports:{},AbortSignal,require:(id:string)=>{
  if(id==="server-only")return {};
  if(id==="@/lib/supabaseAdmin")return {getSupabaseAdmin:()=>({
   from(table:string){
    assert.equal(table,"business_twilio_accounts");
    return {select(fields:string){
     assert.equal(fields,"twilio_subaccount_sid");
     return {eq(column:string,value:string){
      assert.equal(column,"business_id");assert.equal(value,"cb25acc0-3623-4c06-9041-89a88f4ad6ed");accountReads.push(value);
      return {maybeSingle:async()=>({data:missingAccount?null:{twilio_subaccount_sid:account},error:null})};
     }};
    }};
   }
  })};
  if(id==="@/lib/platformAccess")return {isServonasPlatformAdmin};
  if(id==="@/lib/supabaseServer")return {createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user}})}})};
  if(id==="@/lib/twilio/subaccountWebhookSecrets")return {getSubaccountWebhookSecretResolver:()=>({getSubaccountAuthToken:async(identity:unknown)=>{vaultCalls.push(identity);return "VAULT_TOKEN";}})};
  if(id==="@/lib/twilio/twilioHttp")return {getSubaccountTwilioHttpClient:(sid:string,token:string)=>{
   assert.equal(sid,account);assert.equal(token,"VAULT_TOKEN");
   return {request:async(url:string,options:RequestInit)=>{
    assert.equal(options.method,"GET");assert.equal(options.redirect,"error");calls.push(url);
    if(url.includes("Compliance/Usa2p"))return {compliance:[campaign,{...campaign,campaign_id:"OTHER"}]};
    if(url.includes("IncomingPhoneNumbers"))return {incoming_phone_numbers:[{sid:"PNfixture",phone_number:"+14804855057",account_sid:account,status:"in-use",auth_token:"NEVER_OUTPUT"},{sid:"PNwrong",phone_number:"+14804855057",account_sid:"wrong"}]};
    if(failTrust)throw new Error("SECRET provider body VAULT_TOKEN");
    if(url.includes("EntityAssignments"))return {results:[{sid:"BVfixture",trust_product_sid:product,account_sid:account,object_sid:"BUb95d1fd4604237ee7a740348e9ef5c9b",object_type:"customer_profile",secret:"NEVER_OUTPUT"}],meta:{next_page_url:"https://evil.invalid/steal"}};
    if(url==="https://trusthub.twilio.com/v1/TrustProducts?PageSize=20")return {results:[{sid:product,account_sid:account,status:"twilio-approved",friendly_name:"Candidate",policy_sid:"RNfixture",email:"PRIVATE"}],meta:{next_page_url:"https://evil.invalid/steal"}};
    throw new Error("Unexpected endpoint");
   }};
  }};
  return require(id);
 }});
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
 return {api:context.exports,calls,vaultCalls,accountReads};
}

test("only confirmed platform admins can read Vault or issue diagnostic requests",async()=>{
 for(const user of [null,{email:"user@example.com",email_confirmed_at:"confirmed"},{email:"admin@servonas.com"}]){
  const f=fixture(user);await assert.rejects(()=>f.api.readTemporaryDiagnostic(),/Unauthorized/);assert.equal(f.calls.length,0);assert.equal(f.vaultCalls.length,0);assert.equal(f.accountReads.length,0);
 }
});
test("diagnostic uses the exact tenant, GET endpoints and non-secret output allowlists",async()=>{
 const f=fixture(),data=await f.api.readTemporaryDiagnostic();
 assert.equal(JSON.stringify(f.vaultCalls),JSON.stringify([{businessId:"cb25acc0-3623-4c06-9041-89a88f4ad6ed",subaccountSid:account}]));
 assert.equal(f.calls.length,4);assert.equal(f.calls[0],`https://messaging.twilio.com/v1/Services/${service}/Compliance/Usa2p`);
 assert.ok(f.calls.some(url=>url.includes(`Accounts/${account}/IncomingPhoneNumbers.json?PhoneNumber=%2B14804855057`)));
 assert.equal(f.accountReads.length,1);assert.ok(!JSON.stringify(data).includes(account));
 assert.equal(data.phones.rows[0].account_matches_tenant,true);
 assert.equal(data.phones.rows.length,1);assert.equal(data.phones.rows[0].sid,"PNfixture");
 assert.deepEqual(Object.keys(data.campaigns.rows[0]),["sid","brand_registration_sid","messaging_service_sid","campaign_id","campaign_status"]);
 assert.equal(data.trusts[0].assignments.rows[0].sid,"BVfixture");assert.equal(data.products.more,true);
 assert.doesNotMatch(JSON.stringify(data),/VAULT_TOKEN|NEVER_OUTPUT|PRIVATE|evil.invalid/);
});
test("UI is opt-in, highlights only the exact match and labels partial inventories",async()=>{
 const f=fixture();await f.api.default({run:false});assert.equal(f.calls.length,0);
 const html=renderToStaticMarkup(await f.api.default({run:true}));
 assert.equal((html.match(/aria-label="Matching campaign"/g)??[]).length,1);
 assert.match(html,/background:#dbeafe/);assert.match(html,/VERIFIED/);assert.match(html,/Temporary/);assert.match(html,/Partial inventory/);assert.match(html,/BVfixture/);assert.match(html,/BUb95d1fd4604237ee7a740348e9ef5c9b/);
 assert.doesNotMatch(html,/VAULT_TOKEN|NEVER_OUTPUT|PRIVATE/);assert.ok(!html.includes(account));
});
test("inaccessible Trust Hub cannot leak provider errors or hide campaign and phone results",async()=>{
 const f=fixture(undefined,true),html=renderToStaticMarkup(await f.api.default({run:true}));
 assert.match(html,/Read unavailable/);assert.match(html,/PNfixture/);assert.match(html,/CKZW1Z5/);assert.doesNotMatch(html,/SECRET|VAULT_TOKEN/);
});
test("page keeps diagnostic behind existing admin and fixed business gates",()=>{
 const page=readFileSync(new URL("../app/app/admin/twilio/page.tsx",import.meta.url),"utf8");
 assert.ok(page.indexOf('if(!isServonasPlatformAdmin(user))redirect("/app")')<page.indexOf('<TemporaryDiagnostic'));
 assert.match(page,/business.id==="cb25acc0-3623-4c06-9041-89a88f4ad6ed"&&<TemporaryDiagnostic run=\{query.diagnostic==="1"\}/);
 assert.match(source,/import "server-only"/);
 assert.doesNotMatch(source,/\.insert\(|\.update\(|\.delete\(|syncPhase3\(/);
});

test("missing tenant mapping stops before Vault or Twilio",async()=>{
 const f=fixture(undefined,false,true);await assert.rejects(()=>f.api.readTemporaryDiagnostic(),/Tenant account unavailable/);
 assert.equal(f.vaultCalls.length,0);assert.equal(f.calls.length,0);
});
test("diagnostic and fixtures contain no Twilio account identifier literals",()=>{
 const tests=readFileSync(new URL(import.meta.url),"utf8");
 const pattern=new RegExp("AC"+"[0-9a-fA-F]{32}");
 assert.doesNotMatch(source,pattern);assert.doesNotMatch(tests,pattern);
});
