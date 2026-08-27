import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const read=(path:string)=>fs.readFile(path,"utf8");

test("workspace owners can complete a managed-domain registration with explicit consent",async()=>{
 const [actions,component,page]=await Promise.all([read("app/app/[businessSlug]/settings/website/actions.ts"),read("components/ManagedDomainCustomerSetup.tsx"),read("app/app/[businessSlug]/settings/website/page.tsx")]);
 assert.match(actions,/requireWorkspaceCapability\(slug,"business_onboarding"\)/);
 assert.match(actions,/canManageBusiness\(context\.role\)/);
 assert.match(actions,/state\?\.domain_preference!=="need_domain"/);
 assert.match(actions,/registrationTerms/);
 assert.match(actions,/renewalTerms/);
 assert.doesNotMatch(actions,/text\(data,"confirmation"\)!==`REGISTER \$\{domain\}`/);
 assert.match(actions,/\.eq\("status","available"\)\.is\("provider_order_id",null\)/);
 assert.match(component,/Register \{domain\}/);
 assert.match(component,/first year is included/i);
 assert.match(component,/Due today/);
 assert.match(component,/Renews at/);
 assert.match(component,/DomainRegistrantAddressFields/);
 assert.match(page,/ManagedDomainCustomerSetup/);
});

test("managed registration automatically reconciles without duplicate purchasing",async()=>{
 const [actions,poller]=await Promise.all([read("app/app/[businessSlug]/settings/website/actions.ts"),read("components/ManagedDomainStatusPoller.tsx")]);
 assert.match(actions,/getVercelDomainOrder\(order\.provider_order_id\)/);
 assert.match(actions,/addVercelProjectDomain\(domain\)/);
 assert.match(actions,/getVercelDomainStatus\(domain\)/);
 assert.match(poller,/syncManagedDomainRegistration/);
 assert.match(poller,/setTimeout\(poll,5000\)/);
 assert.match(poller,/attempts\.current>=40/);
});

test("existing-domain DNS connection remains separate",async()=>{
 const page=await read("app/app/[businessSlug]/settings/website/page.tsx");
 assert.match(page,/Connect your DNS/);
 assert.match(page,/connectWebsiteDomain/);
 assert.match(page,/effectiveManagedDomain=websiteFirst\?\.domain_preference==="need_domain"&&websiteFirst\?\.requested_domain/);
 assert.match(page,/managedDomainRequest=Boolean\(effectiveManagedDomain\)/);
});

test("invitation acceptance reuses an existing employee row by email",async()=>{
 const migration=await read("supabase/migrations/20260827000400_fix_invitation_employee_email_conflict.sql");
 assert.match(migration,/create or replace function public\.sync_business_member_employee/);
 assert.match(migration,/where business_id=new\.business_id\s+and lower\(email\)=v_email/);
 assert.match(migration,/set auth_user_id=coalesce\(auth_user_id,new\.user_id\)/);
 assert.match(migration,/if v_employee_id is null then/);
 assert.match(migration,/on conflict\(business_id,auth_user_id\) where auth_user_id is not null/);
});
