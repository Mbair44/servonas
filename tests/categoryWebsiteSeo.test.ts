import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {categoryPageIsIndexable,indexableCategoryPages} from "../lib/publicCategoryPages.ts";

const read=(path:string)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("published category pages are indexable only when active rentals exist",()=>{
 const pages=[{category_id:"bounce",slug:"bounce-house"},{category_id:"bull",slug:"mechanical-bull"}];
 const active=[{category_id:"bounce"},{category_id:null}];
 assert.deepEqual(indexableCategoryPages(pages,active).map(page=>page.slug),["bounce-house"]);
 assert.equal(categoryPageIsIndexable("bounce",active),true);
 assert.equal(categoryPageIsIndexable("bull",active),false);
});

test("category editor updates existing SEO fields without changing the slug",async()=>{
 const [controls,actions,page]=await Promise.all([read("components/CategoryWebsitePageControls.tsx"),read("app/app/[businessSlug]/rental-inventory/actions.ts"),read("app/app/[businessSlug]/rental-inventory/page.tsx")]);
 assert.match(controls,/Page title \/ H1/);
 assert.match(controls,/name="intro"/);
 assert.match(controls,/name="seoTitle"/);
 assert.match(controls,/name="metaDescription"/);
 assert.match(actions,/export async function updateCategoryWebsitePage/);
 assert.match(actions,/update\(\{title,intro,seo_title:seoTitle,meta_description:metaDescription/);
 assert.match(actions,/\.update\(\{title,intro,seo_title:seoTitle,meta_description:metaDescription,updated_at:new Date\(\)\.toISOString\(\)\}\)/);
 assert.match(page,/CategoryWebsitePageControls/);
});

test("public SEO routes exclude empty categories from sitemap and noindex them",async()=>{
 const [root,hosted,domain,sitemap]=await Promise.all([read("app/sitemap.xml/route.ts"),read("app/sites/[siteSlug]/[promotionSlug]/page.tsx"),read("app/sites/domain/[domain]/[promotionSlug]/page.tsx"),read("app/sites/[siteSlug]/sitemap.xml/route.ts")]);
 for(const source of [root,sitemap])assert.match(source,/indexableCategoryPages/);
 for(const source of [hosted,domain])assert.match(source,/categoryPageIsIndexable/);
});

test("location pages link to indexable rental categories and category schema has one stable script id",async()=>{
 const [location,hosted,domain,schema]=await Promise.all([read("components/LocationLanding.tsx"),read("app/sites/[siteSlug]/[promotionSlug]/page.tsx"),read("app/sites/domain/[domain]/[promotionSlug]/page.tsx"),read("components/TenantPublicSchema.tsx")]);
 assert.match(location,/Explore rental categories/);
 assert.match(location,/categoryPages\.map/);
 assert.match(hosted,/categoryPages=\{indexableCategoryPages/);
 assert.match(domain,/categoryPages=\{indexableCategoryPages/);
 assert.match(schema,/id="tenant-landing-schema"/);
 assert.equal((schema.match(/application\/ld\+json/g)??[]).length,2);
});
