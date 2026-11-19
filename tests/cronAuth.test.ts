import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {isAuthorizedCronRequest} from "../lib/cronAuth.ts";

const cronRoutes=[
  "ad-spend-backfill",
  "customer-imports",
  "customer-message-media-cleanup",
  "customer-message-media",
  "dispatch",
  "financial",
  "google-ads-spend",
  "google-reviews",
  "messages",
  "meta-ads-spend",
  "rental-image-cleanup",
  "smart-upsells",
];

function request(authorization?:string){
  return new Request("https://servonas.test/api/cron/test",authorization?{headers:{authorization}}:undefined);
}

function withCronSecret(value:string|undefined,run:()=>void){
  const previous=process.env.CRON_SECRET;
  try{
    if(value===undefined)delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET=value;
    run();
  }finally{
    if(previous===undefined)delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET=previous;
  }
}

test("cron authentication fails closed for missing or empty secrets",()=>{
  withCronSecret(undefined,()=>assert.equal(isAuthorizedCronRequest(request("Bearer any-value")),false));
  withCronSecret("",()=>assert.equal(isAuthorizedCronRequest(request("Bearer any-value")),false));
  withCronSecret("   ",()=>assert.equal(isAuthorizedCronRequest(request("Bearer any-value")),false));
});

test("cron authentication rejects missing and invalid authorization",()=>{
  withCronSecret("test-cron-secret",()=>{
    assert.equal(isAuthorizedCronRequest(request()),false);
    assert.equal(isAuthorizedCronRequest(request("Bearer incorrect")),false);
    assert.equal(isAuthorizedCronRequest(request("Basic test-cron-secret")),false);
  });
});

test("cron authentication accepts Vercel's bearer authorization format",()=>{
  withCronSecret("test-cron-secret",()=>{
    assert.equal(isAuthorizedCronRequest(request("Bearer test-cron-secret")),true);
  });
});

test("every mutation-capable cron route uses the fail-closed authorization guard",()=>{
  for(const route of cronRoutes){
    const source=fs.readFileSync(`app/api/cron/${route}/route.ts`,"utf8");
    assert.match(source,/import\s*\{isAuthorizedCronRequest\}\s*from\s*["']@\/lib\/cronAuth["']/);
    assert.match(source,/if\s*\(!isAuthorizedCronRequest\(request\)\)\s*return NextResponse\.json\(\{\s*error:\s*"Unauthorized"\s*\},\s*\{\s*status:\s*401\s*\}\)/);
    assert.doesNotMatch(source,/process\.env\.CRON_SECRET/);
  }
});
