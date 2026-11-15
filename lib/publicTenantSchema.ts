import {normalizePublicSeoServiceAreas,type PublicSeoServiceArea} from "./publicSeoServiceAreas.ts";

export type PublicBusinessSchema={name:string;phone?:string|null;email?:string|null;logoUrl?:string|null;imageUrls?:string[];sameAs?:string[];publicSeoServiceAreas?:PublicSeoServiceArea[]|null;hours?:Array<{weekday:number;start:string;end:string}|null>|null;publicAddress?:{streetAddress:string;addressLocality:string;addressRegion:string;postalCode?:string|null;addressCountry?:string}|null};

const weekday=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const clean=(value:unknown)=>typeof value==="string"&&value.trim()?value.trim():undefined;
const publicUrl=(value:unknown)=>{const normalized=clean(value);return normalized&&/^https:\/\//i.test(normalized)?normalized:undefined;};

/** Builds tenant-isolated, public facts only; undefined values are omitted by JSON.stringify. */
export function tenantHomepageSchema(business:PublicBusinessSchema,url:string){
 const areas=normalizePublicSeoServiceAreas(business.publicSeoServiceAreas);
 const images=[...new Set((business.imageUrls??[]).map(publicUrl).filter((value):value is string=>Boolean(value)))];
 const sameAs=[...new Set((business.sameAs??[]).map(publicUrl).filter((value):value is string=>Boolean(value)))];
 const address=business.publicAddress&&clean(business.publicAddress.streetAddress)&&clean(business.publicAddress.addressLocality)&&clean(business.publicAddress.addressRegion)?{"@type":"PostalAddress",streetAddress:business.publicAddress.streetAddress,addressLocality:business.publicAddress.addressLocality,addressRegion:business.publicAddress.addressRegion,postalCode:clean(business.publicAddress.postalCode),addressCountry:clean(business.publicAddress.addressCountry)??"US"}:undefined;
 const openingHoursSpecification=(business.hours??[]).flatMap(row=>row&&Number.isInteger(row.weekday)&&weekday[row.weekday]&&clean(row.start)&&clean(row.end)?[{"@type":"OpeningHoursSpecification",dayOfWeek:weekday[row.weekday],opens:row.start.slice(0,5),closes:row.end.slice(0,5)}]:[]);
 return {"@context":"https://schema.org","@graph":[{"@type":"LocalBusiness",name:business.name,url,telephone:clean(business.phone),email:clean(business.email),logo:publicUrl(business.logoUrl),image:images.length?images:undefined,sameAs:sameAs.length?sameAs:undefined,areaServed:areas.length?areas.map(area=>({"@type":"City",name:area.city,containedInPlace:{"@type":"State",name:area.state}})):undefined,address,openingHoursSpecification:openingHoursSpecification.length?openingHoursSpecification:undefined},{"@type":"WebSite",name:business.name,url}]};
}
