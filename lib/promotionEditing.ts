import type {SupabaseClient} from "@supabase/supabase-js";
export type PromotionDetails={name:string;slug:string;headline:string;subheadline:string|null;cta_text:string;terms:string|null};
export function parsePromotionDetails(data:FormData):PromotionDetails{
 const field=(name:string,max:number,required=false)=>{const value=String(data.get(name)??"").trim();if((required&&!value)||value.length>max)throw new Error(`Enter ${name==='cta_text'?'button text':name} ${required?'between 1 and':'of no more than'} ${max} characters.`);return value;};
 const name=field("name",160,true),slug=field("slug",80,true).toLowerCase(),headline=field("headline",240,true),subheadline=field("subheadline",2000),cta_text=field("cta_text",100,true),terms=field("terms",10000);
 if(!/^[a-z0-9-]{2,80}$/.test(slug))throw new Error("Use 2–80 lowercase letters, numbers or hyphens for the page URL ending.");
 return {name,slug,headline,subheadline:subheadline||null,cta_text,terms:terms||null};
}
export async function updatePromotionDetails(db:SupabaseClient,businessId:string,promotionId:string,details:PromotionDetails){
 // Explicit field allowlist preserves the linked discount, publication status,
 // category assignments, redemptions and booking history.
 const {data,error}=await db.from("promotions").update({name:details.name,slug:details.slug,headline:details.headline,subheadline:details.subheadline,cta_text:details.cta_text,terms:details.terms})
  .eq("business_id",businessId).eq("id",promotionId).select("id").maybeSingle();
 if(error)throw new Error(error.code==="23505"?"Another promotion already uses that page URL. Choose a different URL ending.":"The promotion could not be saved. Please try again.");
 if(!data)throw new Error("This promotion is unavailable in your workspace.");
}
