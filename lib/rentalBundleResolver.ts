export type BundleGroup={id:string;selection_mode:"fixed"|"customer_selectable";min_selections:number;max_selections:number;items:Array<{inventory_item_id:string;quantity:number;upgrade_price_cents:number}>};
export type BundleAddon={inventory_item_id:string;quantity:number;price_adjustment_cents:number;is_required:boolean};
const weekend=(date:string)=>{const day=new Date(`${date}T12:00:00Z`).getUTCDay();return day===0||day===5||day===6;};
export function resolveRentalBundle(input:{bundle:{id:string;weekday_price_cents:number;weekend_price_cents:number;allow_promotional_discounts:boolean};groups:BundleGroup[];addons:BundleAddon[];selectedGroupItems:Record<string,string[]>;selectedAddonItems:string[];rentalDate:string}){
 const quantities=new Map<string,number>(),add=(id:string,q:number)=>quantities.set(id,(quantities.get(id)??0)+q);let upgrades=0,addonCents=0;
 for(const group of input.groups){const chosen=group.selection_mode==="fixed"?group.items.map(i=>i.inventory_item_id):(input.selectedGroupItems[group.id]??[]);if(chosen.length<group.min_selections||chosen.length>group.max_selections||new Set(chosen).size!==chosen.length)throw new Error("Choose the required bundle items.");for(const id of chosen){const item=group.items.find(i=>i.inventory_item_id===id);if(!item)throw new Error("That item is not available in this bundle.");add(id,item.quantity);upgrades+=item.upgrade_price_cents;}}
 const allowed=new Set(input.addons.map(a=>a.inventory_item_id));for(const id of input.selectedAddonItems){if(!allowed.has(id))throw new Error("That add-on is not available in this bundle.");const addon=input.addons.find(a=>a.inventory_item_id===id)!;add(id,addon.quantity);addonCents+=addon.price_adjustment_cents;}for(const addon of input.addons.filter(a=>a.is_required))if(!input.selectedAddonItems.includes(addon.inventory_item_id)){add(addon.inventory_item_id,addon.quantity);addonCents+=addon.price_adjustment_cents;}
 const base=weekend(input.rentalDate)?input.bundle.weekend_price_cents:input.bundle.weekday_price_cents;return{items:[...quantities].map(([inventoryItemId,quantity])=>({inventoryItemId,quantity})),basePriceCents:base,upgradeCents:upgrades,addonCents,rentalSubtotalCents:base+upgrades+addonCents,allowPromotions:input.bundle.allow_promotional_discounts};
}

/** Proportional list-price allocation with cumulative rounding. */
export function allocateBundleRevenue<T extends {inventoryItemId:string;quantity:number;listUnitPriceCents:number}>(items:T[],totalCents:number){
 if(!Number.isSafeInteger(totalCents)||totalCents<0||items.length===0)throw new Error("Invalid bundle allocation.");
 const ordered=[...items].sort((a,b)=>a.inventoryItemId.localeCompare(b.inventoryItemId));
 const weights=ordered.map(item=>Math.max(0,item.listUnitPriceCents)*item.quantity),weightTotal=weights.reduce((sum,value)=>sum+value,0);
 let allocated=0,cumulative=0;
 return ordered.map((item,index)=>{cumulative+=weightTotal>0?weights[index]:1;const next=index===ordered.length-1?totalCents:Math.round(totalCents*cumulative/(weightTotal||ordered.length));const lineTotalCents=next-allocated;allocated=next;return{inventoryItemId:item.inventoryItemId,quantity:item.quantity,lineTotalCents};});
}
