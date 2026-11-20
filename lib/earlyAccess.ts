export const EARLY_ACCESS_CONSENT_VERSION = "2026-11-20";
export const EARLY_ACCESS_STATUSES = ["new","reviewing","contacted","interested","beta_invited","onboarding","converted","not_interested"] as const;
export const EARLY_ACCESS_SOFTWARE = ["inflatable_office","event_rental_systems","booqable","goodshuffle_pro","spreadsheets_manual","no_software","other"] as const;
export const EARLY_ACCESS_INVENTORY = ["1_10","11_25","26_50","51_100","100_plus"] as const;

export type EarlyAccessStatus = typeof EARLY_ACCESS_STATUSES[number];

const value=(input:unknown,max:number)=>typeof input==="string"?input.trim().slice(0,max):"";
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEarlyAccessLead(input:Record<string,unknown>){
 const contactName=value(input.contactName,120),businessName=value(input.businessName,160),email=value(input.email,254).toLowerCase(),businessCity=value(input.businessCity,120),businessState=value(input.businessState,80),currentSoftware=value(input.currentSoftware,64);
 if(!contactName||!businessName||!businessCity||!businessState||!emailPattern.test(email)||!EARLY_ACCESS_SOFTWARE.includes(currentSoftware as typeof EARLY_ACCESS_SOFTWARE[number])||input.consent!==true)return null;
 const inventorySize=value(input.inventorySize,32);
 if(inventorySize&&!EARLY_ACCESS_INVENTORY.includes(inventorySize as typeof EARLY_ACCESS_INVENTORY[number]))return null;
 const websiteUrl=value(input.websiteUrl,500);
 if(websiteUrl){try{const url=new URL(websiteUrl);if(!/^https?:$/.test(url.protocol))return null;}catch{return null;}}
 return {contact_name:contactName,business_name:businessName,email,phone:value(input.phone,40)||null,business_city:businessCity,business_state:businessState,website_url:websiteUrl||null,current_software:currentSoftware,inventory_size:inventorySize||null,biggest_challenge:value(input.biggestChallenge,2000)||null};
}
