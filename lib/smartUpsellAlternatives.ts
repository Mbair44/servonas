import {rankSmartUpsellCandidates,type SmartUpsellCandidate} from "./smartUpsellCandidates";
import {defaultSmartUpsellSettings,type SmartUpsellSettings} from "./smartUpsells";
import {rentalWindowsOverlap} from "./rentalCalendarAvailability";

type Db=any;
type Alternative=SmartUpsellCandidate & {imageUrl:string|null};

const settingsFor=(row:any):SmartUpsellSettings=>({
 ...defaultSmartUpsellSettings,
 enabled:Boolean(row?.enabled), discountBasisPoints:Number(row?.discount_basis_points??defaultSmartUpsellSettings.discountBasisPoints),
 depositBasisPoints:Number(row?.deposit_basis_points??defaultSmartUpsellSettings.depositBasisPoints),
 additionalDeliveryFeeCents:Number(row?.additional_delivery_fee_cents??0),
 minimumDiscountedPriceCents:row?.minimum_discounted_price_cents==null?null:Number(row.minimum_discounted_price_cents),
});

const localDate=(value:string,timezone:string)=>{const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(value)),by=new Map(parts.map(part=>[part.type,part.value]));return `${by.get("year")}-${by.get("month")}-${by.get("day")}`;};

/** Uses the same candidate ranking and capacity inputs as automated Smart Upsells.
 * It is intentionally server-only: the public page receives only the resulting cards. */
export async function listSmartUpsellAlternatives(db:Db,input:{businessId:string;bookingId:string;featuredInventoryItemId:string;rentalStartsAt:string;rentalEndsAt:string;now?:Date}):Promise<Alternative[]>{
 const now=input.now??new Date();
 const [{data:settingsRow},{data:business},{data:bookedItems},{data:eligible},{data:excluded},{data:inventory},{data:requirements},{data:billing},{data:bookingSettings}]=await Promise.all([
  db.from("business_smart_upsell_settings").select("*").eq("business_id",input.businessId).maybeSingle(),
  db.from("businesses").select("timezone").eq("id",input.businessId).maybeSingle(),
  db.from("booking_items").select("inventory_item_id").eq("booking_id",input.bookingId),
  db.from("smart_upsell_eligible_inventory_items").select("inventory_item_id").eq("business_id",input.businessId),
  db.from("smart_upsell_excluded_inventory_items").select("inventory_item_id").eq("business_id",input.businessId),
  db.from("inventory_items").select("id,name,image_url,daily_price_cents,is_taxable,active,stock_quantity,purchase_cost_cents,expected_lifetime_rentals").eq("business_id",input.businessId).eq("active",true),
  db.from("rental_listing_inventory_requirements").select("listing_inventory_item_id,resource_inventory_item_id,quantity_required").eq("business_id",input.businessId),
  db.from("business_billing_settings").select("tax_enabled,tax_display_mode,default_tax_rate_basis_points").eq("business_id",input.businessId).maybeSingle(),
  db.from("booking_settings").select("buffer_minutes").eq("business_id",input.businessId).maybeSingle(),
 ]);
 const settings=settingsFor(settingsRow); if(!settings.enabled)return [];
 const eligibleIds=new Set((eligible??[]).map((row:any)=>String(row.inventory_item_id))),excludedIds=new Set((excluded??[]).map((row:any)=>String(row.inventory_item_id)));
 const candidates=((inventory??[]) as any[]).filter(item=>eligibleIds.has(item.id)&&!excludedIds.has(item.id)&&item.id!==input.featuredInventoryItemId);
 const requirementsByListing=new Map<string,{resourceInventoryItemId:string;quantityRequired:number}[]>();
 for(const row of requirements??[]){const key=String((row as any).listing_inventory_item_id),values=requirementsByListing.get(key)??[];values.push({resourceInventoryItemId:String((row as any).resource_inventory_item_id),quantityRequired:Number((row as any).quantity_required)});requirementsByListing.set(key,values);}
 const resourceIds=[...new Set(candidates.flatMap(item=>(requirementsByListing.get(item.id)??[]).map(row=>row.resourceInventoryItemId)))]; if(!resourceIds.length)return [];
 const stocks=new Map((inventory??[]).map((item:any)=>[String(item.id),Number(item.stock_quantity??0)])),start=new Date(input.rentalStartsAt),end=new Date(input.rentalEndsAt),buffer=Math.max(0,Number(bookingSettings?.buffer_minutes??60)),windowStart=new Date(start.getTime()-buffer*60_000).toISOString(),windowEnd=new Date(end.getTime()+buffer*60_000).toISOString();
 const [{data:reservations},{data:holds},{data:blocks}]=await Promise.all([
  db.from("booking_inventory_reservations").select("resource_inventory_item_id,quantity,rental_starts_at,rental_ends_at,bookings!inner(status)").eq("business_id",input.businessId).in("resource_inventory_item_id",resourceIds).in("bookings.status",["pending_payment","paid","confirmed"]).lt("rental_starts_at",windowEnd).gt("rental_ends_at",windowStart),
  db.from("booking_amendment_inventory_holds").select("resource_inventory_item_id,quantity,rental_starts_at,rental_ends_at,booking_amendments!inner(status,expires_at)").eq("business_id",input.businessId).in("resource_inventory_item_id",resourceIds).in("booking_amendments.status",["pending_payment","payment_processing"]).gt("booking_amendments.expires_at",now.toISOString()).lt("rental_starts_at",windowEnd).gt("rental_ends_at",windowStart),
  db.from("blocked_dates").select("inventory_item_id").eq("business_id",input.businessId).gte("blocked_date",localDate(input.rentalStartsAt,business?.timezone??"America/Phoenix")).lte("blocked_date",localDate(input.rentalEndsAt,business?.timezone??"America/Phoenix")),
 ]);
 const used=new Map<string,number>(); for(const row of [...(reservations??[]),...(holds??[])] as any[]){const reservedStart=new Date(row.rental_starts_at),reservedEnd=new Date(row.rental_ends_at);if(rentalWindowsOverlap(reservedStart,new Date(reservedEnd.getTime()+buffer*60_000),start,end))used.set(String(row.resource_inventory_item_id),(used.get(String(row.resource_inventory_item_id))??0)+Number(row.quantity??0));}
 const ranked=rankSmartUpsellCandidates({items:candidates,requirements:requirementsByListing,availableByResource:Object.fromEntries(resourceIds.map(id=>[id,Math.max(0,Number(stocks.get(id)??0)-Number(used.get(id)??0))])),blockedItemIds:new Set((blocks??[]).map((row:any)=>String(row.inventory_item_id))),existingItemIds:new Set((bookedItems??[]).map((row:any)=>String(row.inventory_item_id))),settings,taxRateBasisPoints:Number(billing?.default_tax_rate_basis_points??0),taxEnabled:Boolean(billing?.tax_enabled),taxDisplayMode:billing?.tax_display_mode==="inclusive"?"inclusive":"exclusive"});
 const images=new Map(candidates.map(item=>[item.id,item.image_url??null])); return ranked.map(item=>({...item,imageUrl:images.get(item.inventoryItemId)??null}));
}
