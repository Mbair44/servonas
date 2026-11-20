import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=(file:string)=>readFile(new URL(`../${file}`,import.meta.url),"utf8");

test("party-rental homepage has accurate metadata and temporary early-access CTAs",async()=>{
 const [page,layout]=await Promise.all([read("app/page.tsx"),read("app/layout.tsx")]);
 assert.match(page,/Party Rental Software for Bounce House Businesses \| Servonas/);
 assert.match(page,/Manage your party rental business with Servonas/);
 assert.match(page,/alternates:\{canonical:"\/"\}/);
 assert.match(layout,/"@type":"Organization"/);
 assert.match(page,/More Bookings/);
 assert.match(page,/Less Busywork/);
 assert.match(page,/Copper State Bounce/);
 assert.match(page,/href="\/early-access"/);
 assert.match(page,/href="\/party-rental-software"/);
});

test("party-rental software landing has distinct metadata, visible FAQs, canonical, and truthful schemas",async()=>{
 const page=await read("app/party-rental-software/page.tsx");
 assert.match(page,/Party Rental Management Software \| Servonas/);
 assert.match(page,/Explore Servonas party rental management software/);
 assert.match(page,/alternates:\{canonical:"\/party-rental-software"\}/);
 assert.match(page,/SoftwareApplication/);
 assert.match(page,/BreadcrumbList/);
 assert.match(page,/FAQPage/);
 assert.match(page,/Party rental software FAQs/);
 assert.match(page,/industries\/event-party-rentals/);
 assert.match(page,/event-party-rentals-website/);
 assert.match(page,/href="\/early-access"/);
 assert.doesNotMatch(page,/aggregateRating|reviewCount|priceCurrency/);
});

test("marketing sitemap includes party-rental pages while host-aware tenant logic remains intact",async()=>{
 const sitemap=await read("app/sitemap.xml/route.ts");
 assert.match(sitemap,/"party-rental-software"/);
 assert.match(sitemap,/"industries\/event-party-rentals"/);
 assert.match(sitemap,/"event-party-rentals-website"/);
 assert.match(sitemap,/host===platformHost/);
 assert.match(sitemap,/business_website_settings/);
});

test("robots keeps private paths out of search while allowing public marketing routes",async()=>{
 const robots=await read("app/robots.txt/route.ts");
 assert.match(robots,/User-agent: \*/);
 assert.match(robots,/Disallow: \/app\//);
 assert.match(robots,/Disallow: \/api\//);
 assert.match(robots,/Sitemap:/);
 assert.doesNotMatch(robots,/Disallow: \/party-rental-software/);
});

test("global marketing CTA changes do not alter signup implementation or tenant public routing",async()=>{
 const [header,auth,tenantSitemap]=await Promise.all([read("components/HeaderSignupLink.tsx"),read("app/auth/actions.ts"),read("app/sites/[siteSlug]/sitemap.xml/route.ts")]);
 assert.match(header,/Join Early Access/);
 assert.match(header,/\/early-access/);
 assert.match(auth,/export async function signUp/);
 assert.match(auth,/supabase\.auth\.signUp/);
 assert.match(tenantSitemap,/business_website_settings/);
});

test("pricing page presents early access without public price, offer, or trial promises",async()=>{
 const page=await read("app/pricing/page.tsx");
 assert.match(page,/Simple pricing is coming/);
 assert.match(page,/limited number of party rental/);
 assert.match(page,/href="\/early-access"/);
 assert.match(page,/Party Rental Software Early Access/);
 assert.doesNotMatch(page,/\$40|\$75|\$125|\$29|\$59|50%|free trial|no credit card|Product|Offer|priceCurrency/i);
});

test("comparison pages do not retain withdrawn Servonas price promises",async()=>{
 const page=await read("app/vs/[competitor]/page.tsx");
 assert.match(page,/plans and pricing are finalized/);
 assert.doesNotMatch(page,/Servonas starts at \$40|published tiers from \$40 to \$125|\$49\/month|after early access/i);
});
