import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {listSmartUpsellAlternatives,requirementsWithStandaloneFallback} from "../lib/smartUpsellAlternatives.ts";
import {rankSmartUpsellCandidates} from "../lib/smartUpsellCandidates.ts";
import {defaultSmartUpsellSettings} from "../lib/smartUpsells.ts";

const businessId="business",bookingId="booking",start="2026-11-10T16:00:00.000Z",end="2026-11-10T20:00:00.000Z";
const item={id:"standalone",name:"Standalone inflatable",daily_price_cents:20000,is_taxable:false,active:true,stock_quantity:1};

function availabilityDb(input:{stock?:number;reservations?:unknown[];holds?:unknown[];blocks?:unknown[];requirements?:unknown[];sharedStock?:number}={}){
 const rows:Record<string,unknown>={
  business_smart_upsell_settings:{enabled:true,discount_basis_points:5000,deposit_basis_points:5000,additional_delivery_fee_cents:0},
  businesses:{timezone:"America/Phoenix"},booking_items:[],smart_upsell_eligible_inventory_items:[{inventory_item_id:item.id}],smart_upsell_excluded_inventory_items:[],
  inventory_items:[{...item,stock_quantity:input.stock??1},...(input.sharedStock===undefined?[]:[{id:"shared",name:"Shared resource",daily_price_cents:0,is_taxable:false,active:true,stock_quantity:input.sharedStock}])],
  rental_listing_inventory_requirements:input.requirements??[],business_billing_settings:{tax_enabled:false,tax_display_mode:"exclusive",default_tax_rate_basis_points:0},booking_settings:{buffer_minutes:60},
  booking_inventory_reservations:input.reservations??[],booking_amendment_inventory_holds:input.holds??[],blocked_dates:input.blocks??[],
 };
 return {from(table:string){
  const query:any={select:()=>query,eq:()=>query,in:()=>query,lt:()=>query,gt:()=>query,gte:()=>query,lte:()=>query,maybeSingle:()=>query,
   then:(resolve:any,reject:any)=>Promise.resolve({data:rows[table]??null,error:null}).then(resolve,reject)};
  return query;
 }};
}

async function alternatives(input:Parameters<typeof availabilityDb>[0]){
 return listSmartUpsellAlternatives(availabilityDb(input),{businessId,bookingId,featuredInventoryItemId:"featured",rentalStartsAt:start,rentalEndsAt:end,now:new Date("2026-11-01T00:00:00.000Z")});
}

test("standalone listings use their own finite stock and operational commitments",async()=>{
 const requirements=requirementsWithStandaloneFallback([item],new Map());
 assert.deepEqual(requirements.get(item.id),[{resourceInventoryItemId:item.id,quantityRequired:1}]);
 assert.equal((await alternatives({stock:1})).length,1);
 assert.equal((await alternatives({stock:0})).length,0,"zero standalone stock is unavailable");
 assert.equal((await alternatives({reservations:[{resource_inventory_item_id:item.id,quantity:1,rental_starts_at:"2026-11-10T15:30:00.000Z",rental_ends_at:"2026-11-10T15:45:00.000Z"}]})).length,0,"buffered reservation consumes the last unit");
 assert.equal((await alternatives({holds:[{resource_inventory_item_id:item.id,quantity:1,rental_starts_at:start,rental_ends_at:end}]})).length,0,"active amendment hold consumes the last unit");
 assert.equal((await alternatives({blocks:[{inventory_item_id:item.id}]})).length,0,"blocked standalone listing is unavailable");
});

test("shared-resource mappings remain authoritative and do not consume standalone stock",async()=>{
 const requirements=[{listing_inventory_item_id:item.id,resource_inventory_item_id:"shared",quantity_required:1}];
 const resolved=requirementsWithStandaloneFallback([item],new Map([[item.id,[{resourceInventoryItemId:"shared",quantityRequired:1}]]]));
 assert.deepEqual(resolved.get(item.id),[{resourceInventoryItemId:"shared",quantityRequired:1}]);
 assert.equal((await alternatives({stock:0,sharedStock:1,requirements})).length,1,"shared capacity permits the listing even when its display row has no standalone stock");
 assert.equal((await alternatives({stock:99,sharedStock:0,requirements})).length,0,"listing stock cannot bypass exhausted shared capacity");
});

test("candidate ranking rejects exhausted resources before a second checkout can be staged",()=>{
 const requirements=requirementsWithStandaloneFallback([item],new Map());
 const first=rankSmartUpsellCandidates({items:[item],requirements,availableByResource:{standalone:1},blockedItemIds:new Set(),existingItemIds:new Set(),settings:defaultSmartUpsellSettings,taxRateBasisPoints:0,taxEnabled:false,taxDisplayMode:"exclusive"});
 const second=rankSmartUpsellCandidates({items:[item],requirements,availableByResource:{standalone:0},blockedItemIds:new Set(),existingItemIds:new Set(),settings:defaultSmartUpsellSettings,taxRateBasisPoints:0,taxEnabled:false,taxDisplayMode:"exclusive"});
 assert.equal(first.length,1);assert.equal(second.length,0);
 const staging=readFileSync(new URL("../supabase/migrations/20260921000200_staged_booking_item_amendments.sql",import.meta.url),"utf8");
 assert.match(staging,/pg_advisory_xact_lock/);assert.match(staging,/booking_amendment_inventory_holds/);
});
