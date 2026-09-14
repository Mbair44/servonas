import assert from "node:assert/strict";
import test from "node:test";
import {filterPromotionInventory,loadPromotionEligibility,promotionEligibleItemIds} from "../lib/promotionEligibility.ts";
const items=[{id:"bounce"},{id:"chair"},{id:"table"}];
test("missing links never turn a selected-item offer into an all-rentals offer",()=>{
 assert.deepEqual(filterPromotionInventory(items,"selected_items",new Set()),[]);
});
test("order-wide promotions keep their rentals even without category links",()=>{
 assert.deepEqual(filterPromotionInventory(items,"order",new Set()),items);
});
test("both saved item targets and category rentals appear on landing and booking",()=>{
 const eligible=promotionEligibleItemIds([{inventory_item_id:"chair"}],[{id:"bounce"}]);
 assert.deepEqual(filterPromotionInventory(items,"selected_items",eligible),[{id:"bounce"},{id:"chair"}]);
});
function database(failTable?:string){
 const calls:{table:string;filters:Record<string,unknown>}[]=[];
 return {calls,from(table:string){const filters:Record<string,unknown>={};calls.push({table,filters});
  const response=()=>({error:table===failTable?{code:"42501"}:null,data:table==="discount_items"?[{inventory_item_id:"chair"}]:table==="promotions"?{id:"promotion"}:table==="promotion_categories"?[{category_id:"category"}]:[{id:"bounce"}]});
  const q:any={select:()=>q,eq:(key:string,value:unknown)=>{filters[key]=value;return q;},in:(key:string,value:unknown)=>{filters[key]=value;return q;},maybeSingle:async()=>response(),then:(resolve:any,reject:any)=>Promise.resolve(response()).then(resolve,reject)};return q;
 }};
}
test("eligibility resolves categories from the tenant-owned discount without relying on a URL promotion ID",async()=>{
 const db=database(),result=await loadPromotionEligibility(db,"tenant","discount");
 assert.equal(result.promotionId,"promotion");assert.deepEqual([...result.eligibleIds].sort(),["bounce","chair"]);
 for(const call of db.calls.filter(call=>call.table!=="promotion_categories"))assert.equal(call.filters.business_id,"tenant");
 assert.equal(db.calls.find(call=>call.table==="promotion_categories")?.filters.promotion_id,"promotion");
});
test("failed eligibility queries are errors, not empty category lists or all-rental offers",async()=>{
 for(const table of ["discount_items","promotions","promotion_categories","inventory_items"])await assert.rejects(()=>loadPromotionEligibility(database(table),"tenant","discount"),/could not be loaded/);
});
