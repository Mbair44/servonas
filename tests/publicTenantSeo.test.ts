import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {publicSitemapXml} from "../lib/locationSitemap.ts";
import {hostedTenantRobots,tenantCanonicalUrl} from "../lib/publicTenantSeo.ts";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("sitemap includes only published public content supplied by the route and deduplicates slugs",()=>{
 const xml=publicSitemapXml("https://example.com",[{slug:"gilbert",updated_at:null},{slug:"bounce-houses",updated_at:null},{slug:"fall-special",updated_at:null},{slug:"gilbert",updated_at:null}]);
 assert.match(xml,/<loc>https:\/\/example\.com<\/loc>/);
 assert.match(xml,/<loc>https:\/\/example\.com\/bounce-houses<\/loc>/);
 assert.equal((xml.match(/example\.com\/gilbert/g)??[]).length,1);
 assert.doesNotMatch(xml,/booking|checkout|manage-booking/);
});

test("custom domains canonicalize hosted tenant pages and mark hosted duplicates noindex",()=>{
 const settings={custom_domain:"example.com",domain_status:"connected"};
 assert.equal(tenantCanonicalUrl(settings,"/water-slides","https://servonas.com/sites/example"),"https://example.com/water-slides");
 assert.deepEqual(hostedTenantRobots(settings),{index:false,follow:true});
 assert.deepEqual(hostedTenantRobots({}),{index:true,follow:true});
});

test("public SEO routes include categories and active landing pages, block transaction routes, and render schemas",async()=>{
 const [sitemap,robots,domain,hosted,schemas,booking]=await Promise.all([read("app/sitemap.xml/route.ts"),read("app/robots.txt/route.ts"),read("app/sites/domain/[domain]/[promotionSlug]/page.tsx"),read("app/sites/[siteSlug]/[promotionSlug]/page.tsx"),read("components/TenantPublicSchema.tsx"),read("app/sites/domain/[domain]/booking/page.tsx")]);
 assert.match(sitemap,/category_website_pages/);assert.match(sitemap,/promotions/);assert.match(sitemap,/status","active"/);assert.match(sitemap,/landing_page_enabled/);
 assert.match(robots,/Disallow: \/manage-booking\//);assert.match(robots,/Disallow: \/booking/);assert.match(robots,/Sitemap:/);
 assert.match(domain,/TenantLandingSchema type="WebPage"/);assert.match(domain,/TenantLandingSchema type="CollectionPage"/);assert.match(hosted,/hostedTenantRobots/);
 assert.match(schemas,/LocalBusiness/);assert.match(schemas,/WebSite/);assert.match(schemas,/BreadcrumbList/);assert.match(booking,/index:false/);
});
