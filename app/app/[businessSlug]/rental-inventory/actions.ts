"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageBusiness} from "@/lib/access";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {requireWorkspace} from "@/lib/workspace";
import type {SupabaseClient} from "@supabase/supabase-js";

const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const path=(slug:string,kind:"success"|"error",message:string)=>`/app/${slug}/rental-inventory?${kind}=${encodeURIComponent(message)}`;
const slugify=(value:string)=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70);
const uploadRules={image:{bucket:"inventory-images",max:8*1024*1024,types:new Set(["image/jpeg","image/png","image/webp"])},receipt:{bucket:"rental-purchase-receipts",max:10*1024*1024,types:new Set(["application/pdf","image/jpeg","image/png","image/webp"])}} as const;

async function context(slug:string){
 const workspace=await requireWorkspace(slug);
 if(workspace.business.industry_profile!=="party_rental")redirect(`/app/${slug}`);
 if(!canManageBusiness(workspace.role))redirect(path(slug,"error","Only owners and administrators can manage rental inventory."));
 return workspace;
}

export async function prepareRentalUpload(slug:string,kind:"image"|"receipt",name:string,type:string,size:number){
 const {business}=await context(slug),rules=uploadRules[kind];
 if(!rules.types.has(type)||!Number.isFinite(size)||size<=0||size>rules.max)throw new Error(kind==="image"?"Choose a JPG, PNG, or WebP image no larger than 8 MB.":"Choose a PDF, JPG, PNG, or WebP receipt no larger than 10 MB.");
 const admin=getSupabaseAdmin();if(!admin)throw new Error("File upload is not configured.");
 const extension=type==="application/pdf"?"pdf":type==="image/png"?"png":type==="image/webp"?"webp":"jpg",storagePath=`${business.id}/${crypto.randomUUID()}.${extension}`;
 const {data,error}=await admin.storage.from(rules.bucket).createSignedUploadUrl(storagePath);
 if(error||!data)throw new Error("The upload could not be prepared. Please try again.");
 return {bucket:rules.bucket,path:storagePath,token:data.token,name:name.slice(0,180)};
}

function directPath(data:FormData,key:string,businessId:string){const value=text(data,key);return value.startsWith(`${businessId}/`)?value:null;}

async function values(supabase:SupabaseClient,businessId:string,data:FormData){
 const name=text(data,"name"),categoryId=text(data,"categoryId")||null,description=text(data,"description"),price=Number(text(data,"price")),purchaseCostRaw=text(data,"purchaseCost"),purchaseCost=purchaseCostRaw===""?null:Number(purchaseCostRaw),stock=Number(text(data,"stockQuantity"));
 if(!name||name.length>120)throw new Error("Enter a rental name up to 120 characters.");
 if(!Number.isFinite(price)||price<0||price>100000)throw new Error("Enter a valid daily rental price.");
 if(purchaseCost!==null&&(!Number.isFinite(purchaseCost)||purchaseCost<0||purchaseCost>10000000))throw new Error("Enter a valid purchase cost.");
 if(!Number.isInteger(stock)||stock<1||stock>10000)throw new Error("Stock quantity must be between 1 and 10,000.");
 const {data:category}=categoryId?await supabase.from("rental_inventory_categories").select("id,name").eq("id",categoryId).eq("business_id",businessId).maybeSingle():{data:null};
 if(categoryId&&!category)throw new Error("Choose a category that belongs to this business.");
 return {name,category_id:category?.id??null,category:category?.name??null,description:description||null,daily_price_cents:Math.round(price*100),purchase_cost_cents:purchaseCost===null?null:Math.round(purchaseCost*100),stock_quantity:stock,allow_quantity:data.get("allowQuantity")==="on",active:data.get("active")==="on"};
}
async function replaceUpsells(supabase:SupabaseClient,businessId:string,itemId:string,data:FormData){
 const requested=[...new Set(data.getAll("relatedItemIds").map(String).filter(id=>id&&id!==itemId))];
 const {data:valid}=requested.length?await supabase.from("inventory_items").select("id").eq("business_id",businessId).eq("active",true).in("id",requested):{data:[]};
 if((valid??[]).length!==requested.length)throw new Error("One or more upsell items are unavailable.");
 const {error:removeError}=await supabase.from("rental_item_upsells").delete().eq("business_id",businessId).eq("source_item_id",itemId);
 if(removeError)throw new Error("Upsell items could not be saved. Apply the latest rental upsell migration.");
 if(requested.length){const {error}=await supabase.from("rental_item_upsells").insert(requested.map((suggested_item_id,sort_order)=>({business_id:businessId,source_item_id:itemId,suggested_item_id,sort_order})));if(error)throw new Error("Upsell items could not be saved.");}
}

export async function createRentalItem(slug:string,data:FormData){
 const {supabase,business}=await context(slug);
 try{
  const payload=await values(supabase,business.id,data),imagePath=directPath(data,"uploadedImagePath",business.id),receiptPath=directPath(data,"uploadedReceiptPath",business.id),admin=getSupabaseAdmin(),image=imagePath&&admin?admin.storage.from("inventory-images").getPublicUrl(imagePath).data.publicUrl:null;
  const {data:item,error}=await supabase.from("inventory_items").insert({...payload,business_id:business.id,slug:`${slugify(payload.name)||"rental"}-${crypto.randomUUID().slice(0,8)}`,image_url:image,purchase_receipt_path:receiptPath,purchase_receipt_name:text(data,"uploadedReceiptName")||null}).select("id").single();
  if(error&&receiptPath){await admin?.storage.from("rental-purchase-receipts").remove([receiptPath]);}
  if(error||!item)throw new Error(error?.code==="23505"?"A rental with that identifier already exists.":"The rental item could not be added. Apply the rental inventory migration first.");
  await replaceUpsells(supabase,business.id,item.id,data);
 }catch(error){redirect(path(slug,"error",error instanceof Error?error.message:"The rental item could not be added."));}
 revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/book`);redirect(path(slug,"success","Rental item added."));
}

export async function updateRentalItem(slug:string,itemId:string,data:FormData){
 const {supabase,business}=await context(slug);
 try{
  const payload=await values(supabase,business.id,data),imagePath=directPath(data,"uploadedImagePath",business.id),receiptPath=directPath(data,"uploadedReceiptPath",business.id),admin=getSupabaseAdmin(),image=imagePath&&admin?admin.storage.from("inventory-images").getPublicUrl(imagePath).data.publicUrl:null;
  const {data:existing}=await supabase.from("inventory_items").select("purchase_receipt_path").eq("id",itemId).eq("business_id",business.id).maybeSingle();
  const removeReceipt=data.get("removePurchaseReceipt")==="on";
  const receiptFields=receiptPath?{purchase_receipt_path:receiptPath,purchase_receipt_name:text(data,"uploadedReceiptName")||null}:removeReceipt?{purchase_receipt_path:null,purchase_receipt_name:null}:{};
  const {error}=await supabase.from("inventory_items").update({...payload,...(image?{image_url:image}:{}),...receiptFields}).eq("id",itemId).eq("business_id",business.id);
  if(error&&receiptPath)await admin?.storage.from("rental-purchase-receipts").remove([receiptPath]);
  if(error)throw new Error("The rental item could not be updated.");
  if((receiptPath||removeReceipt)&&existing?.purchase_receipt_path&&existing.purchase_receipt_path!==receiptPath)await admin?.storage.from("rental-purchase-receipts").remove([existing.purchase_receipt_path]);
  await replaceUpsells(supabase,business.id,itemId,data);
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

export async function createRentalCategory(slug:string,data:FormData){
 const {supabase,business}=await context(slug);const name=text(data,"name"),sortOrder=Number(text(data,"sortOrder")||0);
 if(!name||name.length>80)redirect(path(slug,"error","Enter a category name up to 80 characters."));
 const {error}=await supabase.from("rental_inventory_categories").insert({business_id:business.id,name,sort_order:Number.isInteger(sortOrder)?sortOrder:0});
 if(error)redirect(path(slug,"error",error.code==="23505"?"That category already exists.":"The category could not be created. Apply the latest rental category migration."));
 revalidatePath(`/app/${slug}/rental-inventory`);redirect(path(slug,"success","Rental category created."));
}

export async function updateRentalCategory(slug:string,categoryId:string,data:FormData){
 const {supabase,business}=await context(slug);const name=text(data,"name"),sortOrder=Number(text(data,"sortOrder")||0);
 if(!name||name.length>80)redirect(path(slug,"error","Enter a category name up to 80 characters."));
 const {error}=await supabase.from("rental_inventory_categories").update({name,sort_order:Number.isInteger(sortOrder)?sortOrder:0,updated_at:new Date().toISOString()}).eq("id",categoryId).eq("business_id",business.id);
 if(error)redirect(path(slug,"error",error.code==="23505"?"That category already exists.":"The category could not be updated."));
 await supabase.from("inventory_items").update({category:name}).eq("business_id",business.id).eq("category_id",categoryId);
 revalidatePath(`/app/${slug}/rental-inventory`);redirect(path(slug,"success","Rental category updated."));
}

export async function deleteRentalCategory(slug:string,categoryId:string,data:FormData){
 const {supabase,business}=await context(slug);const replacementId=text(data,"replacementCategoryId")||null;
 const {data:count,error}=await supabase.rpc("delete_rental_inventory_category",{p_business_id:business.id,p_category_id:categoryId,p_replacement_category_id:replacementId});
 if(error)redirect(path(slug,"error",error.message||"The category could not be deleted."));
 revalidatePath(`/app/${slug}/rental-inventory`);redirect(path(slug,"success",`Category deleted${Number(count)>0?` and ${count} item${Number(count)===1?"":"s"} reassigned`:""}.`));
}
