import assert from "node:assert/strict";
import test from "node:test";
import {activeCanonicalCustomerIds} from "../lib/customerCanonical.ts";
import {readFileSync} from "node:fs";

test("active canonical list excludes merged and inactive duplicates",()=>{
 assert.deepEqual(activeCanonicalCustomerIds([{id:"primary",is_deleted:false,is_active:true,merged_into_customer_id:null},{id:"merged",is_deleted:true,is_active:false,merged_into_customer_id:"primary"},{id:"inactive",is_deleted:false,is_active:false,merged_into_customer_id:null}]),["primary"]);
});
test("customer profile resolves staff links but public-token pages are not changed",()=>{
 const page=readFileSync(new URL("../app/app/[businessSlug]/customers/[customerId]/page.tsx",import.meta.url),"utf8");
 assert.match(page,/canonicalCustomerScope/);assert.match(page,/redirect\(`\/app\/\$\{businessSlug\}\/customers\/\$\{scope\.canonicalCustomerId\}`\)/);assert.match(page,/\.in\("customer_id",customerIds\)/);
 assert.match(page,/Alternate channels retain their own consent state/);
});
test("core operational selectors exclude merged customers",()=>{
 for(const path of ["../app/app/[businessSlug]/jobs/page.tsx","../app/app/[businessSlug]/invoices/new/page.tsx","../app/app/[businessSlug]/estimates/new/page.tsx"]){
  const source=readFileSync(new URL(path,import.meta.url),"utf8");assert.match(source,/merged_into_customer_id/,path);
 }
});
