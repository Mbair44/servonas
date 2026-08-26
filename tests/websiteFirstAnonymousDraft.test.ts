import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("anonymous website-first drafts are backed by a dedicated server-side table and rpc",async()=>{
 const migration=await read("supabase/migrations/20260826000100_website_builder_anonymous_drafts.sql");
 assert.match(migration,/create table if not exists public\.website_builder_drafts/i);
 assert.match(migration,/token_hash text not null unique/i);
 assert.match(migration,/current_step text not null default 'business'/i);
 assert.match(migration,/create or replace function public\.create_anonymous_website_first_workspace/i);
});

test("onboarding no longer hard-redirects website-first visitors to login before step 1",async()=>{
 const onboarding=await read("app/onboarding/page.tsx");
 assert.doesNotMatch(onboarding,/if\(!user\)redirect\("\/login\?next=\/onboarding"\)/);
 assert.match(onboarding,/const websiteSource=getWebsiteFirstConfig\(query\.source\)/);
 assert.match(onboarding,/if\(websiteSource\)return <main className="onboarding-shell website-first-onboarding"><WebsiteFirstBusiness/);
});

test("anonymous builder workspace creation stores a resumable draft cookie and row",async()=>{
 const [actions,draftLib]=await Promise.all([read("app/onboarding/actions.ts"),read("lib/websiteBuilderDraft.ts")]);
 assert.match(actions,/create_anonymous_website_first_workspace/);
 assert.match(actions,/website_builder_drafts/);
 assert.match(actions,/setWebsiteBuilderDraftCookie\(token\)/);
 assert.match(draftLib,/servonas_website_builder_draft/);
 assert.match(draftLib,/claimWebsiteBuilderDraftForUser/);
});

test("generated anonymous previews render through a draft-only public preview route",async()=>{
 const [preview,route]=await Promise.all([read("components/WebsiteFirstPreview.tsx"),read("app/sites/preview/[siteSlug]/page.tsx")]);
 assert.match(preview,/accountRequired/);
 assert.match(preview,/\/sites\/preview\/\$\{website\?\.public_slug\?\?businessSlug\}/);
 assert.match(preview,/Create My Free Account/);
 assert.match(preview,/Already have an account\? Sign in/);
 assert.match(route,/loadWebsiteBuilderDraftForBusinessSlug/);
 assert.match(route,/preview\/>/);
});

test("sign in and auth callback claim an anonymous draft and return to the generated website",async()=>{
 const [authActions,callback]=await Promise.all([read("app/auth/actions.ts"),read("app/auth/callback/route.ts")]);
 assert.match(authActions,/claimWebsiteBuilderDraftForUser/);
 assert.match(authActions,/website is saved! You can keep editing or publish when you're ready\./i);
 assert.match(callback,/claimWebsiteBuilderDraftForUser/);
 assert.match(callback,/\/onboarding\?business=\$\{encodeURIComponent\(claimed\.businessSlug\)\}&websiteStep=preview/);
});

test("legacy website-first landing and demo pages send visitors into onboarding instead of signup",async()=>{
 const [landing,demo,pestDemo,rentalsDemo]=await Promise.all([
  read("app/pest-control-website/page.tsx"),
  read("components/WebsiteIndustryDemo.tsx"),
  read("app/demo/pest-control/page.tsx"),
  read("app/demo/event-party-rentals/page.tsx"),
 ]);
 assert.match(landing,/return `\/onboarding\?\$\{query\}`;/);
 assert.match(demo,/Link href=\{`\/onboarding\?\$\{query\}`\}/);
 assert.match(pestDemo,/Link href=\{`\/onboarding\?\$\{query\}`\}/);
 assert.match(rentalsDemo,/Link href=\{`\/onboarding\?\$\{query\}`\}/);
});
