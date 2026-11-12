import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {waterHeaterQuoteErrors} from "../lib/website.ts";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
const valid={name:"Taylor Customer",phone:"623-363-9151",email:"",zipCode:"85296",serviceId:"water_heater_replace",urgency:"within_few_days",requestKey:"123e4567-e89b-42d3-a456-426614174000",referralConsent:"agreed"};

test("water heater quote validation accepts optional email and rejects incomplete referral data",()=>{
 assert.deepEqual(waterHeaterQuoteErrors(valid),{});
 assert.equal(waterHeaterQuoteErrors({...valid,zipCode:"8529"}).zipCode,"Enter a valid ZIP code.");
 assert.equal(waterHeaterQuoteErrors({...valid,referralConsent:""}).referralConsent,"You must agree before we can connect you with a contractor.");
 assert.equal(waterHeaterQuoteErrors({...valid,urgency:"today"}).urgency,"Choose when you need help.");
});

test("Gilbert Water Heater Pro uses a tenant-scoped referral quote form and persists structured consent",async()=>{
 const [site,form,action,migration]=await Promise.all([read("components/BusinessWebsite.tsx"),read("components/WebsiteRequestForm.tsx"),read("app/sites/[siteSlug]/actions.ts"),read("supabase/migrations/20261112000200_website_request_referral_metadata.sql")]);
 assert.match(site,/isGilbertWaterHeaterPro=site\.customDomain==="gilbertwaterheaterpro\.com"/);
 assert.match(site,/gilbert-water-heather-pro/);
 assert.match(site,/variant=\{isGilbertWaterHeaterPro\?"water_heater_quote"/);
 assert.match(site,/Water Heater Replacement in Gilbert, AZ/);
 assert.match(form,/name="zipCode"/);
 assert.match(form,/placeholder="e\.g\., 85296"/);
 assert.match(form,/name="urgency"/);
 assert.match(form,/name="referralConsent"/);
 assert.match(form,/Get My Free Quote/);
 assert.match(form,/Your quote request has been received!/);
 assert.match(action,/const isGilbertWaterHeaterWebsite=/);
 assert.match(action,/isGilbertWaterHeaterWebsite\(website\)/);
 assert.match(action,/requestVariant==="water_heater_quote"&&!isGilbertWaterHeaterWebsite\(website\)/);
 assert.match(action,/lead_metadata:isWaterHeaterQuote\?\{service_requested:serviceValue,urgency,zip_code:zipCode,referral_consent/);
 assert.match(action,/service_address:isWaterHeaterQuote\?null:address/);
 assert.match(migration,/add column if not exists lead_metadata jsonb/);
 assert.match(migration,/alter column service_address drop not null/);
});

test("the address-free water heater variant is authorized from trusted website identity",async()=>{
 const action=await read("app/sites/[siteSlug]/actions.ts");
 assert.match(action,/gilbertWaterHeaterPublicSlugs=new Set\(\["gilbert-water-heater-pro","gilbert-water-heather-pro"\]\)/);
 assert.match(action,/custom_domain.*gilbertwaterheaterpro\.com/);
 assert.match(action,/if\(!\["service","quote","christmas_quote","water_heater_quote"\]\.includes\(requestVariant\)\)/);
});
