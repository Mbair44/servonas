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
 assert.match(page,/managedDomainRequest&&websiteFirst\?\.requested_domain/);
});
