"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageBusiness} from "@/lib/access";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {requireWorkspace} from "@/lib/workspace";

const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const path=(slug:string,kind:"success"|"error",message:string)=>`/app/${slug}/rental-inventory?${kind}=${encodeURIComponent(message)}`;
const slugify=(value:string)=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70);

async function context(slug:string){
 const workspace=await requireWorkspace(slug);
 if(workspace.business.industry_profile!=="party_rental")redirect(`/app/${slug}`);
 if(!canManageBusiness(workspace.role))redirect(path(slug,"error","Only owners and administrators can manage rental inventory."));
 return workspace;
}

async function uploadImage(businessId:string,entry:FormDataEntryValue|null){
 if(!(entry instanceof File)||!entry.size)return null;
 if(!entry.type.startsWith("image/")||entry.size>8*1024*1024)throw new Error("Choose a JPG, PNG, or WebP image smaller than 8 MB.");
 const admin=getSupabaseAdmin();if(!admin)throw new Error("Image upload is not configured.");
 const extension=(entry.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
 const storagePath=`${businessId}/${crypto.randomUUID()}.${extension}`;
 const {error}=await admin.storage.from("inventory-images").upload(storagePath,entry,{contentType:entry.type,upsert:false});
 if(error)throw new Error("The rental image could not be uploaded.");
 return admin.storage.from("inventory-images").getPublicUrl(storagePath).data.publicUrl;
}

function values(data:FormData){
 const name=text(data,"name"),category=text(data,"category"),description=text(data,"description"),price=Number(text(data,"price")),stock=Number(text(data,"stockQuantity"));
 if(!name||name.length>120)throw new Error("Enter a rental name up to 120 characters.");
 if(category.length>80)throw new Error("Enter a category up to 80 characters.");
 if(!Number.isFinite(price)||price<0||price>100000)throw new Error("Enter a valid daily rental price.");
 if(!Number.isInteger(stock)||stock<1||stock>10000)throw new Error("Stock quantity must be between 1 and 10,000.");
 return {name,category:category||null,description:description||null,daily_price_cents:Math.round(price*100),stock_quantity:stock,allow_quantity:data.get("allowQuantity")==="on",active:data.get("active")==="on"};
}

export async function createRentalItem(slug:string,data:FormData){
 const {supabase,business}=await context(slug);
 try{
  const payload=values(data),image=await uploadImage(business.id,data.get("image"));
  const {error}=await supabase.from("inventory_items").insert({...payload,business_id:business.id,slug:`${slugify(payload.name)||"rental"}-${crypto.randomUUID().slice(0,8)}`,image_url:image});
  if(error)throw new Error(error.code==="23505"?"A rental with that identifier already exists.":"The rental item could not be added. Apply the rental inventory migration first.");
 }catch(error){redirect(path(slug,"error",error instanceof Error?error.message:"The rental item could not be added."));}
 revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/book`);redirect(path(slug,"success","Rental item added."));
}

export async function updateRentalItem(slug:string,itemId:string,data:FormData){
 const {supabase,business}=await context(slug);
 try{
  const payload=values(data),image=await uploadImage(business.id,data.get("image"));
  const {error}=await supabase.from("inventory_items").update({...payload,...(image?{image_url:image}:{})}).eq("id",itemId).eq("business_id",business.id);
  if(error)throw new Error("The rental item could not be updated.");
 }catch(error){redirect(path(slug,"error",error instanceof Error?error.message:"The rental item could not be updated."));}
 revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/book`);redirect(path(slug,"success","Rental item updated."));
}

export async function archiveRentalItem(slug:string,itemId:string){
 const {supabase,business}=await context(slug);
 const {error}=await supabase.from("inventory_items").update({active:false}).eq("id",itemId).eq("business_id",business.id);
 if(error)redirect(path(slug,"error","The rental item could not be deactivated."));
 revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/book`);redirect(path(slug,"success","Rental item deactivated."));
}
export async function saveRentalItemUpsells(slug:string,itemId:string,data:FormData){
 const {supabase,business}=await context(slug);
 const requested=[...new Set(data.getAll("relatedItemIds").map(String).filter(id=>id&&id!==itemId))];
 const {data:valid}=requested.length?await supabase.from("inventory_items").select("id").eq("business_id",business.id).eq("active",true).in("id",requested):{data:[]};
 if((valid??[]).length!==requested.length)redirect(path(slug,"error","One or more related items are unavailable."));
 const {error:removeError}=await supabase.from("rental_item_upsells").delete().eq("business_id",business.id).eq("source_item_id",itemId);
 if(removeError)redirect(path(slug,"error","Related items could not be saved. Apply the latest rental upsell migration."));
 if(requested.length){const {error}=await supabase.from("rental_item_upsells").insert(requested.map((suggested_item_id,sort_order)=>({business_id:business.id,source_item_id:itemId,suggested_item_id,sort_order})));if(error)redirect(path(slug,"error","Related items could not be saved."));}
 revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/book`);redirect(path(slug,"success","Related item suggestions saved."));
}
