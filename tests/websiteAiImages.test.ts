import assert from "node:assert/strict";
import test from "node:test";
import {buildWebsiteAiImagePrompt,estimateWebsiteAiImageCost,normalizeWebsiteAiImageQuality,normalizeWebsiteAiImageSize,websiteAiImageFeature,websiteAiImageLimit} from "../lib/websiteAiImages.ts";

test("industry-aware prompts include service context and safety constraints",()=>{
 const prompt=buildWebsiteAiImagePrompt({
  businessId:"b1",
  businessName:"Desert Shine Detailing",
  industryProfile:"car_detailing",
  websiteSource:"car-detailing-website",
  city:"Gilbert",
  state:"Arizona",
  serviceAreas:["Chandler"],
  services:["Interior Detail","Ceramic Coating"],
  section:"website_photos",
  imageType:"professional_at_work",
  customDescription:null,
 });
 assert.match(prompt,/car-detailing/i);
 assert.match(prompt,/Gilbert, Arizona/);
 assert.match(prompt,/Interior Detail, Ceramic Coating/);
 assert.match(prompt,/no logos/i);
 assert.match(prompt,/no readable text/i);
 assert.match(prompt,/unsafe work practices/i);
});

test("custom descriptions are folded into the prompt without dropping constraints",()=>{
 const prompt=buildWebsiteAiImagePrompt({
  businessId:"b1",
  businessName:"Precision Climate",
  industryProfile:"hvac",
  websiteSource:"hvac-website",
  city:"Mesa",
  state:"Arizona",
  serviceAreas:[],
  services:["AC Repair"],
  section:"hero",
  imageType:"custom_description",
  customDescription:"Show a technician on a rooftop unit at sunrise.",
 });
 assert.match(prompt,/Customer direction: Show a technician on a rooftop unit at sunrise\./);
 assert.match(prompt,/no watermarks/i);
});

test("limit logic prefers entitlement overrides and falls back to the shared default",()=>{
 assert.equal(websiteAiImageLimit({entitlement:null,limits:{[websiteAiImageFeature]:7}}),7);
 assert.equal(websiteAiImageLimit({entitlement:null,limits:{}}),20);
});

test("cost and option normalization are deterministic",()=>{
 assert.equal(estimateWebsiteAiImageCost(0.063,2),0.126);
 assert.equal(estimateWebsiteAiImageCost(null,1),null);
 assert.equal(normalizeWebsiteAiImageSize("1024x1024"),"1024x1024");
 assert.equal(normalizeWebsiteAiImageSize("bad"),"1536x1024");
 assert.equal(normalizeWebsiteAiImageQuality("high"),"high");
 assert.equal(normalizeWebsiteAiImageQuality("bad"),"medium");
});
