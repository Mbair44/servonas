export type StripeTaxCodeSource="item"|"category"|"business"|null;
export type StripeTaxCodeOption={id:string;name:string;description:string};

// This is only the offline/loading fallback. The picker loads Stripe's complete
// Tax Code catalog from the authenticated server route.
export const stripeTaxCodeFallbackOptions:StripeTaxCodeOption[]=[
 {id:"txcd_99999999",name:"General — Tangible Goods",description:"Physical goods; use as the normal starting classification for rental equipment when your tax professional has not provided a more specific Stripe code."},
 {id:"txcd_10000000",name:"General — Services",description:"General services. Do not use for physical rental equipment unless it is the appropriate classification for your business."},
];

export function filterStripeTaxCodeOptions(options:StripeTaxCodeOption[],query:string,limit=25){
 const normalized=query.trim().toLocaleLowerCase();
 return options.filter(option=>!normalized||[option.id,option.name,option.description].some(value=>value.toLocaleLowerCase().includes(normalized))).slice(0,limit);
}

export function validStripeTaxCode(value:string|null|undefined){return value==null||value===""||/^txcd_[A-Za-z0-9_]+$/.test(value);}

export function resolveRentalStripeTaxCode(input:{itemTaxCode?:string|null;categoryTaxCode?:string|null;businessDefaultTaxCode?:string|null}){
 const candidates:[StripeTaxCodeSource,string|null|undefined][]=[["item",input.itemTaxCode],["category",input.categoryTaxCode],["business",input.businessDefaultTaxCode]];
 for(const [source,value] of candidates){const normalized=value?.trim()||null;if(normalized)return {taxCode:normalized,source};}
 return {taxCode:null,source:null};
}
