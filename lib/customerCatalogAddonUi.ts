export type CustomerCatalogAddon={id:string;name:string;description:string|null;imageUrl:string|null;unitPriceCents:number;maxQuantity:number};

export function pruneCustomerAddonQuantities(quantities:Record<string,number>,addons:CustomerCatalogAddon[]){
 const limits=new Map(addons.map(addon=>[addon.id,addon.maxQuantity]));
 return Object.fromEntries(Object.entries(quantities).flatMap(([id,value])=>{
  const limit=limits.get(id),quantity=Math.floor(Number(value));
  return limit&&Number.isFinite(quantity)&&quantity>0?[[id,Math.min(limit,quantity)]]:[];
 }));
}

export function customerAddonEstimateCents(quantities:Record<string,number>,addons:CustomerCatalogAddon[]){
 return addons.reduce((total,addon)=>total+(quantities[addon.id]??0)*addon.unitPriceCents,0);
}
