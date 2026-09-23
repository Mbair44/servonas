import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {matchesPublicRentalSlug,publicRentalSlug} from "../lib/publicRental.ts";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
test("public rental slugs are stable and collision-safe for duplicate names",()=>{
 const a={id:"12345678-1234-1234-1234-123456789abc",name:"Big Slide!"},b={id:"abcdef12-1234-1234-1234-123456789abc",name:"Big Slide!"};
 assert.match(publicRentalSlug(a),/^big-slide-1234567812$/);assert.notEqual(publicRentalSlug(a),publicRentalSlug(b));assert.ok(matchesPublicRentalSlug(a,publicRentalSlug(a)));assert.equal(matchesPublicRentalSlug(a,publicRentalSlug(b)),false);
});
test("rental SEO uses active inventory, tenant canonicals, Product schema and sitemap URLs",async()=>{
 const [domain,hosted,sitemap,detail,category]=await Promise.all([read("app/sites/domain/[domain]/rentals/[itemSlug]/page.tsx"),read("app/sites/[siteSlug]/rentals/[itemSlug]/page.tsx"),read("app/sitemap.xml/route.ts"),read("components/RentalDetailLanding.tsx"),read("components/CategoryLanding.tsx")]);
 assert.match(domain,/\.eq\("active",true\)/);assert.match(domain,/matchesPublicRentalSlug/);assert.match(domain,/\"@type\":\"Product\"/);assert.match(domain,/tenantMetadata/);
 assert.match(hosted,/hostedTenantRobots/);assert.match(hosted,/index:hostedTenantRobots/);assert.match(sitemap,/rentals\/\$\{publicRentalSlug/);
 assert.match(detail,/<h1>\{item\.name\}<\/h1>/);assert.match(detail,/Check Availability/);assert.match(detail,/Related rentals/);assert.match(category,/publicRentalSlug/);
});
