"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageBusiness} from "@/lib/access";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {requireWorkspace} from "@/lib/workspace";
import type {SupabaseClient} from "@supabase/supabase-js";
import {buildImageVariantPaths,imageVariantCacheControl,managedImageVariantPathsFromPublicUrl} from "@/lib/storageImageVariants";

const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const path=(slug:string,kind:"success"|"error",message:string)=>`/app/${slug}/rental-inventory?${kind}=${encodeURIComponent(message)}`;
const slugify=(value:string)=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70);
const uploadRules={image:{bucket:"inventory-images",max:8*1024*1024,types:new Set(["image/jpeg","image/png","image/webp"])},receipt:{bucket:"rental-purchase-receipts",max:10*1024*1024,types:new Set(["application/pdf","image/jpeg","image/png","image/webp"])}} as const;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;

function eachDate(startDate:string,endDate:string){
 const dates:string[]=[];
 const start=new Date(`${startDate}T12:00:00Z`),end=new Date(`${endDate}T12:00:00Z`);
 if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||start>end)return dates;
 for(const cursor=new Date(start);cursor<=end;cursor.setUTCDate(cursor.getUTCDate()+1))dates.push(cursor.toISOString().slice(0,10));
 return dates;
}

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
 if(kind==="receipt"){
  const extension=type==="application/pdf"?"pdf":type==="image/png"?"png":type==="image/webp"?"webp":"jpg",storagePath=`${business.id}/${crypto.randomUUID()}.${extension}`;
  const {data,error}=await admin.storage.from(rules.bucket).createSignedUploadUrl(storagePath);
  if(error||!data)throw new Error("The upload could not be prepared. Please try again.");
  return {bucket:rules.bucket,path:storagePath,token:data.token,name:name.slice(0,180)};
 }
 const paths=buildImageVariantPaths(business.id,"webp");
 const [displayUpload,thumbUpload]=await Promise.all([
  admin.storage.from(rules.bucket).createSignedUploadUrl(paths.displayPath),
  admin.storage.from(rules.bucket).createSignedUploadUrl(paths.thumbPath),
 ]);
 if(displayUpload.error||!displayUpload.data||thumbUpload.error||!thumbUpload.data)throw new Error("The upload could not be prepared. Please try again.");
 return {
  bucket:rules.bucket,
  display:{path:paths.displayPath,token:displayUpload.data.token,url:admin.storage.from(rules.bucket).getPublicUrl(paths.displayPath).data.publicUrl},
  thumb:{path:paths.thumbPath,token:thumbUpload.data.token,url:admin.storage.from(rules.bucket).getPublicUrl(paths.thumbPath).data.publicUrl},
  cacheControl:imageVariantCacheControl(),
  name:name.slice(0,180),
 };
}

function directPath(data:FormData,key:string,businessId:string){const value=text(data,key);return value.startsWith(`${businessId}/`)?value:null;}
function optionalPositiveNumber(value:string,fieldLabel:string){
 if(value==="")return null;
 const numeric=Number(value);
 if(!Number.isFinite(numeric)||numeric<=0)throw new Error(`Enter a valid ${fieldLabel} in feet.`);
 return Number(numeric.toFixed(2));
}

async function values(supabase:SupabaseClient,businessId:string,data:FormData){
 const name=text(data,"name"),categoryId=text(data,"categoryId")||null,description=text(data,"description"),price=Number(text(data,"price")),purchaseCostRaw=text(data,"purchaseCost"),purchaseCost=purchaseCostRaw===""?null:Number(purchaseCostRaw),stock=Number(text(data,"stockQuantity"));
 const lengthFt=optionalPositiveNumber(text(data,"lengthFt"),"length"),widthFt=optionalPositiveNumber(text(data,"widthFt"),"width"),heightFt=optionalPositiveNumber(text(data,"heightFt"),"height");
 const operatorMode=text(data,"operatorMode")||"none",operatorRateRaw=text(data,"operatorHourlyRate"),operatorRate=operatorRateRaw===""?null:Number(operatorRateRaw);
 if(!name||name.length>120)throw new Error("Enter a rental name up to 120 characters.");
 if(!Number.isFinite(price)||price<0||price>100000)throw new Error("Enter a valid daily rental price.");
 if(purchaseCost!==null&&(!Number.isFinite(purchaseCost)||purchaseCost<0||purchaseCost>10000000))throw new Error("Enter a valid purchase cost.");
 if(!Number.isInteger(stock)||stock<1||stock>10000)throw new Error("Stock quantity must be between 1 and 10,000.");
 if(!["none","optional","required"].includes(operatorMode))throw new Error("Choose a valid operator option.");
 if(operatorMode!=="none"&&(!Number.isFinite(operatorRate)||operatorRate===null||operatorRate<0||operatorRate>1000000))throw new Error("Enter a valid operator hourly rate.");
 const {data:category}=categoryId?await supabase.from("rental_inventory_categories").select("id,name").eq("id",categoryId).eq("business_id",businessId).maybeSingle():{data:null};
 if(categoryId&&!category)throw new Error("Choose a category that belongs to this business.");
 const overrideType=text(data,"additionalDayPricingTypeOverride"),overrideDiscount=text(data,"additionalDayDiscountPercentOverride"),overrideFlat=text(data,"additionalDayFlatRateOverride"),overrideHours=text(data,"standardRentalHoursOverride"),overrideMax=text(data,"maxRentalDaysOverride");
 const overrideTouched=data.get("usePricingOverride")==="on"||Boolean(overrideHours)||Boolean(overrideDiscount)||Boolean(overrideFlat)||Boolean(overrideMax)||overrideType!=="full_price"||data.get("allowMultiDayOverride")==="on";
 const useOverride=overrideTouched;
 if(useOverride&&(!["full_price","percentage_discount","flat_rate"].includes(overrideType)||!Number.isInteger(Number(overrideHours))||Number(overrideHours)<1||(overrideDiscount&&(Number(overrideDiscount)<0||Number(overrideDiscount)>100))||(overrideFlat&&Number(overrideFlat)<0)||(overrideMax&&Number(overrideMax)<1)))throw new Error("Review the item-specific rental pricing.");
 return {name,category_id:category?.id??null,category:category?.name??null,description:description||null,daily_price_cents:Math.round(price*100),purchase_cost_cents:purchaseCost===null?null:Math.round(purchaseCost*100),stock_quantity:stock,length_ft:lengthFt,width_ft:widthFt,height_ft:heightFt,allow_quantity:data.get("allowQuantity")==="on",active:data.get("active")==="on",standard_rental_hours_override:useOverride?Number(overrideHours):null,allow_multi_day_override:useOverride?data.get("allowMultiDayOverride")==="on":null,additional_day_pricing_type_override:useOverride?overrideType:null,additional_day_discount_percent_override:useOverride&&overrideDiscount?Number(overrideDiscount):null,additional_day_flat_rate_cents_override:useOverride&&overrideFlat?Math.round(Number(overrideFlat)*100):null,max_rental_days_override:useOverride&&overrideMax?Number(overrideMax):null,operator_mode:operatorMode,operator_hourly_rate_cents:operatorMode==="none"?null:Math.round(operatorRate!*100),operator_default_selected:operatorMode==="required"?true:data.get("operatorDefaultSelected")==="on"};
}
async function replaceUpsells(supabase:SupabaseClient,businessId:string,itemId:string,data:FormData){
 const requested=[...new Set(data.getAll("relatedItemIds").map(String).filter(id=>id&&id!==itemId))];
 const {data:valid}=requested.length?await supabase.from("inventory_items").select("id").eq("business_id",businessId).eq("active",true).in("id",requested):{data:[]};
 if((valid??[]).length!==requested.length)throw new Error("One or more upsell items are unavailable.");
 const {error:removeError}=await supabase.from("rental_item_upsells").delete().eq("business_id",businessId).eq("source_item_id",itemId);
 if(removeError)throw new Error("Upsell items could not be saved. Apply the latest rental upsell migration.");
 if(requested.length){const {error}=await supabase.from("rental_item_upsells").insert(requested.map((suggested_item_id,sort_order)=>({business_id:businessId,source_item_id:itemId,suggested_item_id,sort_order})));if(error)throw new Error("Upsell items could not be saved.");}
}

async function removeInventoryImageVariants(url:string|null|undefined){
 const paths=managedImageVariantPathsFromPublicUrl(url,"inventory-images");
 if(!paths.length)return;
 await getSupabaseAdmin()?.storage.from("inventory-images").remove(paths);
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
  const {data:existing}=await supabase.from("inventory_items").select("purchase_receipt_path,image_url").eq("id",itemId).eq("business_id",business.id).maybeSingle();
  const removeReceipt=data.get("removePurchaseReceipt")==="on";
  const receiptFields=receiptPath?{purchase_receipt_path:receiptPath,purchase_receipt_name:text(data,"uploadedReceiptName")||null}:removeReceipt?{purchase_receipt_path:null,purchase_receipt_name:null}:{};
  const {error}=await supabase.from("inventory_items").update({...payload,...(image?{image_url:image}:{}),...receiptFields}).eq("id",itemId).eq("business_id",business.id);
  if(error&&receiptPath)await admin?.storage.from("rental-purchase-receipts").remove([receiptPath]);
  if(error)throw new Error("The rental item could not be updated.");
  if((receiptPath||removeReceipt)&&existing?.purchase_receipt_path&&existing.purchase_receipt_path!==receiptPath)await admin?.storage.from("rental-purchase-receipts").remove([existing.purchase_receipt_path]);
  if(image&&existing?.image_url&&existing.image_url!==image)await removeInventoryImageVariants(existing.image_url);
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

export async function addRentalItemBlockedDate(slug:string,itemId:string,data:FormData){
 const {supabase,business}=await context(slug),startDate=text(data,"startDate"),endDate=text(data,"endDate")||startDate,reason=text(data,"reason");
 if(!datePattern.test(startDate)||!datePattern.test(endDate))redirect(path(slug,"error","Choose a valid start and end date to block."));
 if(startDate>endDate)redirect(path(slug,"error","The blocked end date must be on or after the start date."));
 const {data:item}=await supabase.from("inventory_items").select("id,name").eq("id",itemId).eq("business_id",business.id).maybeSingle();
 if(!item)redirect(path(slug,"error","Rental item not found."));
 const admin=getSupabaseAdmin();if(!admin)redirect(path(slug,"error","Rental availability is not configured."));
 const requestedDates=eachDate(startDate,endDate);
 if(!requestedDates.length)redirect(path(slug,"error","Choose a valid blocked date range."));
 const {data:existing,error:existingError}=await admin.from("blocked_dates").select("blocked_date").eq("business_id",business.id).eq("inventory_item_id",item.id).gte("blocked_date",startDate).lte("blocked_date",endDate);
 if(existingError)redirect(path(slug,"error","Existing blocked dates could not be checked."));
 const existingDates=new Set((existing??[]).map(row=>row.blocked_date));
 const missingDates=requestedDates.filter(value=>!existingDates.has(value));
 if(!missingDates.length)redirect(path(slug,"error",`${item.name} is already blocked for that entire date range.`));
 const {error}=await admin.from("blocked_dates").insert(missingDates.map(blockedDate=>({business_id:business.id,inventory_item_id:item.id,blocked_date:blockedDate,reason:reason||null})));
 if(error)redirect(path(slug,"error","That item date range could not be blocked. Apply the rental booking migrations if needed."));
 const rangeLabel=startDate===endDate?startDate:`${startDate} through ${endDate}`;
 revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/book/${slug}`);redirect(path(slug,"success",`${item.name} is blocked for ${missingDates.length} date${missingDates.length===1?"":"s"} from ${rangeLabel}.`));
}

export async function removeRentalItemBlockedDate(slug:string,itemId:string,blockedDateId:string){
 const {business}=await context(slug),admin=getSupabaseAdmin();if(!admin)redirect(path(slug,"error","Rental availability is not configured."));
 const {error}=await admin.from("blocked_dates").delete().eq("id",blockedDateId).eq("business_id",business.id).eq("inventory_item_id",itemId);
 if(error)redirect(path(slug,"error","That item date could not be removed."));
 revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/book/${slug}`);redirect(path(slug,"success","Item blocked date removed."));
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

export async function createCategoryWebsitePage(slug:string,categoryId:string){const {supabase,business,role}=await context(slug);if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can create website pages."));const {data:category}=await supabase.from("rental_inventory_categories").select("id,name").eq("id",categoryId).eq("business_id",business.id).maybeSingle();if(!category)redirect(path(slug,"error","Category not found."));const pageSlug=slugify(category.name);const {error}=await supabase.from("category_website_pages").insert({business_id:business.id,category_id:category.id,slug:pageSlug,title:category.name,intro:`Browse available ${category.name.toLowerCase()} from ${business.name}.`,seo_title:`${category.name} | ${business.name}`});if(error)redirect(path(slug,"error",error.code==="23505"?"A page already uses that URL. Rename the category or choose another page URL.":"The website page could not be created."));revalidatePath(`/app/${slug}/rental-inventory`);redirect(path(slug,"success","Website page draft created. Review it before publishing."));}
export async function publishCategoryWebsitePage(slug:string,pageId:string){const {supabase,business,role}=await context(slug);if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can publish website pages."));await supabase.from("category_website_pages").update({status:"published",published_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",pageId).eq("business_id",business.id);revalidatePath(`/app/${slug}/rental-inventory`);redirect(path(slug,"success","Category website page published."));}

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
