import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {calculateDiscount,type DiscountRule} from "../lib/discounts.ts";

const root=new URL("..",import.meta.url);
const read=(path:string)=>readFile(new URL(path,root),"utf8");
const credit:DiscountRule={id:"credit",business_id:"tenant",name:"$200 credit",code:"TRUNK200",discount_type:"fixed",discount_value:20_000,applies_to:"selected_items",minimum_subtotal_cents:null,starts_at:null,expires_at:null,usage_limit:null,per_customer_limit:null,first_time_customer_only:false,is_active:true};

test("draft promotion preview is workspace-authorized and public links remain active-only",async()=>{
 const [preview,dashboard,publicRoute]=await Promise.all([
  read("app/app/[businessSlug]/marketing/promotions/[promotionId]/preview/page.tsx"),
  read("app/app/[businessSlug]/marketing/promotions/page.tsx"),
  read("app/sites/[siteSlug]/[promotionSlug]/page.tsx"),
 ]);
 assert.match(preview,/requireWorkspace/);assert.match(preview,/canManageBusiness/);assert.match(preview,/\.eq\("business_id",business\.id\)\.eq\("id",promotionId\)/);assert.match(preview,/previewMode/);
 assert.match(dashboard,/marketing\/promotions\/\$\{promotion\.id\}\/preview/);assert.match(dashboard,/promotion\.status==="active"&&url/);
 assert.match(publicRoute,/\.eq\("status","active"\)/);
});

test("a $200 credit is applied once across multiple eligible rentals",()=>{
 const result=calculateDiscount(credit,[{id:"bounce",quantity:1,unitPriceCents:25_000},{id:"slide",quantity:1,unitPriceCents:30_000}],new Set(["bounce","slide"]));
 assert.ok(result.ok);if(!result.ok)return;
 assert.equal(result.discountCents,20_000);assert.equal(result.totalCents,35_000);
});
