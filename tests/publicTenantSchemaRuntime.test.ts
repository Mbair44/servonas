import assert from "node:assert/strict";
import test from "node:test";
import {parsePublicSeoServiceAreas} from "../lib/publicSeoServiceAreas.ts";
import {tenantHomepageSchema} from "../lib/publicTenantSchema.ts";

const local=(schema:ReturnType<typeof tenantHomepageSchema>)=>JSON.parse(JSON.stringify(schema))["@graph"][0] as Record<string,unknown>;

test("LocalBusiness emits only validated tenant-configured city/state areas",()=>{
 const business=local(tenantHomepageSchema({name:"Example",publicSeoServiceAreas:[{city:"Gilbert",state:"Arizona"},{city:"Mesa",state:"AZ"}]},"https://example.com"));
 assert.deepEqual(business.areaServed,[
  {"@type":"City",name:"Gilbert",containedInPlace:{"@type":"State",name:"Arizona"}},
  {"@type":"City",name:"Mesa",containedInPlace:{"@type":"State",name:"Arizona"}},
 ]);
});

test("LocalBusiness safely omits empty, malformed, and non-public values",()=>{
 const business=local(tenantHomepageSchema({
  name:"Example",phone:"  ",email:null,publicSeoServiceAreas:[null,{city:"85233",state:"Arizona"},{city:"Gilbert",state:"not-a-state"}] as any,
  hours:[null,{weekday:8,start:"09:00",end:"17:00"},{weekday:1,start:"",end:"17:00"}] as any,
  imageUrls:["http://example.com/image.jpg","javascript:alert(1)",""],sameAs:["http://social.example","not a url"],publicAddress:null,
 },"https://example.com"));
 for(const field of ["telephone","email","areaServed","openingHoursSpecification","image","sameAs","address"])assert.equal(field in business,false);
});

test("LocalBusiness emits an address only after explicit public-address enablement",()=>{
 const hidden=local(tenantHomepageSchema({name:"Example",publicAddress:null},"https://example.com"));
 assert.equal("address" in hidden,false);
 const visible=local(tenantHomepageSchema({name:"Example",publicAddress:{streetAddress:"1 Main St",addressLocality:"Gilbert",addressRegion:"AZ",postalCode:"85233"}},"https://example.com"));
 assert.deepEqual(visible.address,{"@type":"PostalAddress",streetAddress:"1 Main St",addressLocality:"Gilbert",addressRegion:"AZ",postalCode:"85233",addressCountry:"US"});
});

test("schema construction keeps tenant facts isolated",()=>{
 const alpha=JSON.stringify(tenantHomepageSchema({name:"Alpha",email:"alpha@example.com",publicSeoServiceAreas:[{city:"Gilbert",state:"Arizona"}]},"https://alpha.example"));
 const beta=JSON.stringify(tenantHomepageSchema({name:"Beta",email:"beta@example.com",publicSeoServiceAreas:[{city:"Mesa",state:"Arizona"}]},"https://beta.example"));
 assert.match(alpha,/alpha@example\.com/);assert.doesNotMatch(alpha,/beta@example\.com|Mesa/);
 assert.match(beta,/beta@example\.com/);assert.doesNotMatch(beta,/alpha@example\.com|Gilbert/);
});

test("authenticated settings parser accepts city/state pairs and rejects operational-style entries",()=>{
 assert.deepEqual(parsePublicSeoServiceAreas("Gilbert, Arizona\nQueen Creek, AZ"),{areas:[{city:"Gilbert",state:"Arizona"},{city:"Queen Creek",state:"Arizona"}],error:null});
 assert.match(parsePublicSeoServiceAreas("East Valley\n85233, Arizona").error??"",/City, State|valid US city/);
});
