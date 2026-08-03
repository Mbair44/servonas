import assert from "node:assert/strict";
import test from "node:test";
import {normalizeWebsiteDomain,normalizeWebsitePhone,validWebsiteColor,validWebsiteSlug,websiteRequestErrors,websiteTemplates} from "../lib/website.ts";

test("website settings accept only opinionated templates and safe public slugs",()=>{
 assert.deepEqual(websiteTemplates,["modern","traditional","bold"]);
 assert.equal(validWebsiteSlug("acme-plumbing"),true);
 assert.equal(validWebsiteSlug("Acme Plumbing"),false);
 assert.equal(validWebsiteColor("#1769f5"),true);
 assert.equal(validWebsiteColor("blue"),false);
});
test("custom domains normalize without paths or protocols",()=>{
 assert.equal(normalizeWebsiteDomain("https://WWW.AcmePlumbing.com/path"),"www.acmeplumbing.com");
 assert.equal(normalizeWebsiteDomain("acmeplumbing.com"),"acmeplumbing.com");
 assert.equal(normalizeWebsiteDomain("not a domain"),null);
});
test("website requests require valid contact and service details",()=>{
 const valid=websiteRequestErrors({name:"Ada Smith",phone:normalizeWebsitePhone("480-555-0123"),email:"ada@example.com",address:"123 Main St",description:"My air conditioner stopped cooling.",requestKey:"123e4567-e89b-42d3-a456-426614174000"});
 assert.deepEqual(valid,{});
 const invalid=websiteRequestErrors({name:"",phone:"12",email:"bad",address:"",description:"",requestKey:"bad"});
 assert.deepEqual(Object.keys(invalid).sort(),["address","description","email","form","name","phone"]);
});
