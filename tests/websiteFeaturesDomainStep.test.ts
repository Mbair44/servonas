import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("website features use concise selectable cards",async()=>{
 const [page,styles]=await Promise.all([read("app/app/[businessSlug]/settings/website/page.tsx"),read("app/website-builder.css")]);
 assert.match(page,/Website Features/);
 assert.match(page,/Choose how customers can interact with your website/);
 assert.match(page,/Customers submit a service request and your team follows up to schedule the job/);
 assert.match(page,/Customers choose an available date and time and book directly from your website/);
 assert.match(page,/Finish booking setup to enable direct online scheduling/);
 assert.match(page,/Setup required/);
 assert.match(page,/Your Custom Domain/);
 assert.match(page,/Availability check pending/);
 assert.match(page,/We’ll confirm availability and connect your domain once it’s ready/);
 assert.doesNotMatch(page,/Enable Online Booking before selecting this option/);
 assert.match(styles,/website-toggle-list>label:has\(input:checked\):after/);
 assert.match(styles,/content:"✓"/);
 assert.match(styles,/website-features-layout\{display:grid;grid-template-columns:minmax\(0,1\.7fr\) minmax\(210px,1fr\)/);
 assert.match(styles,/label:has\(input:disabled\)\{cursor:default;opacity:1\}/);
 assert.match(styles,/@container\(max-width:500px\).*website-toggle-list\{grid-template-columns:1fr\}/);
});

test("owned domains follow save then check connection",async()=>{
 const page=await read("app/app/[businessSlug]/settings/website/page.tsx");
 assert.match(page,/connectWebsiteDomain/);
 assert.match(page,/>Save Domain</);
 assert.match(page,/>Check Connection</);
 assert.match(page,/settings\?\.custom_domain&&<button[^>]+checkWebsiteDomain/);
 assert.match(page,/Save your domain first/);
});

test("managed domains submit through the parent website settings form",async()=>{
 const [page,submit,actions]=await Promise.all([read("app/app/[businessSlug]/settings/website/page.tsx"),read("components/DomainAvailabilitySubmit.tsx"),read("app/app/[businessSlug]/settings/website/actions.ts")]);
 assert.match(page,/className="website-first-domain-entry"><label>Find your \.com/);
 assert.match(page,/DomainAvailabilitySubmit formAction=\{saveLegacyManagedDomainChoice\.bind\(null,businessSlug\)\}/);
 assert.match(page,/legacyManagedDomain=normalizeWebsiteDomain\(String\(q\.managedDomain\?\?"\"\)\)/);
 assert.match(page,/effectiveManagedDomain=websiteFirst\?\.domain_preference==="need_domain"&&websiteFirst\?\.requested_domain\?websiteFirst\.requested_domain:legacyDomainMode==="managed"&&legacyManagedDomain\?legacyManagedDomain:""/);
 assert.match(page,/ManagedDomainCustomerSetup businessSlug=\{businessSlug\} domain=\{effectiveManagedDomain\} status=\{effectiveManagedDomainStatus\}/);
 assert.doesNotMatch(page,/<form className="website-first-domain-entry" action=\{saveLegacyManagedDomainChoice\.bind\(null,businessSlug\)\}>/);
 assert.match(submit,/formAction,\s*formNoValidate=true/);
 assert.match(submit,/<button className="sv-button" type="submit" formAction=\{formAction\} formNoValidate=\{formNoValidate\}/);
 assert.match(actions,/await checkManagedDomainAvailabilityForLegacy\(slug,\{admin,user,business,domain:domainName,persistSelection:true\}\)/);
 assert.match(actions,/legacyManagedDomainExtra\(status==="available"\?"details":"search",domainSuggestions,domain,status\)/);
 assert.match(actions,/if\(input\.persistSelection\)\{/);
 assert.doesNotMatch(actions,/source:"website_settings"/);
});

test("managed pilot domains do not expose DNS setup",async()=>{
 const [page,managed]=await Promise.all([read("app/app/[businessSlug]/settings/website/page.tsx"),read("components/ManagedDomainCustomerSetup.tsx")]);
 assert.match(page,/requested_domain,domain_request_status/);
 assert.match(page,/managedDomainRequest=Boolean\(effectiveManagedDomain\)/);
 assert.match(page,/legacyManagedDomainStatus=String\(q\.domainStatus\?\?"\"\)/);
 assert.match(page,/ManagedDomainCustomerSetup/);
 assert.match(managed,/Check Availability →/);
 assert.doesNotMatch(managed,/Connect your DNS/);
});
