"use server";

import {profitabilityAssumptionsFromForm} from "@/lib/rentalEquipmentProfitability";
import {parseCurrencyToCents} from "@/lib/financial/priceBook";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageBusiness} from "@/lib/access";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {requireWorkspace} from "@/lib/workspace";
import type {SupabaseClient} from "@supabase/supabase-js";
import {buildImageVariantPaths,imageVariantCacheControl} from "@/lib/storageImageVariants";
import {validStripeTaxCode} from "@/lib/stripeTaxCodes";

const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const path=(slug:string,kind:"success"|"error",message:string)=>`/app/${slug}/rental-inventory?${kind}=${encodeURIComponent(message)}`;
const slugify=(value:string)=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70);
const uploadRules={image:{bucket:"inventory-images",max:8*1024*1024,types:new Set(["image/jpeg","image/png","image/webp"])},receipt:{bucket:"rental-purchase-receipts",max:10*1024*1024,types:new Set(["application/pdf","image/jpeg","image/png","image/webp"])}} as const;
const datePattern=/^\d{4}-\d{2}-\d{2}$/;

export async function updateRentalProfitabilitySettings(slug:string,data:FormData){
 const {supabase,business,user}=await context(slug),laborMethod=text(data,"laborMethod"),deliveryMethod=text(data,"deliveryMethod");
 const money=(key:string,required=false)=>{const raw=text(data,key);if(!raw)return required?undefined:null;return parseCurrencyToCents(raw);};
 const laborFixed=money("laborFixed",laborMethod==="fixed"),laborHourly=money("laborHourly",laborMethod==="hourly"),deliveryFixed=money("deliveryFixed",deliveryMethod==="fixed"),deliveryPerMile=money("deliveryPerMile",deliveryMethod==="per_mile"),deliveryPerDriveHour=money("deliveryPerDriveHour",deliveryMethod==="per_drive_hour"),processingFixed=money("processingFixed"),otherFixed=money("otherFixed"),percentRaw=text(data,"processingPercent"),percent=percentRaw===""?null:Math.round(Number(percentRaw)*100);
 if(!["","fixed","hourly"].includes(laborMethod)||!["","fixed","per_mile","per_drive_hour"].includes(deliveryMethod)||[laborFixed,laborHourly,deliveryFixed,deliveryPerMile,deliveryPerDriveHour,processingFixed,otherFixed].some(value=>value===undefined||value!==null&&(!Number.isSafeInteger(value)||value<0||value>2147483647))||!Number.isSafeInteger(percent??0)||percent!==null&&(percent<0||percent>10000)||((percent===null)!==(processingFixed===null)))redirect(path(slug,"error","Enter complete, valid operating-cost assumptions or leave that category blank."));
 const {error}=await supabase.from("business_rental_profitability_settings").upsert({business_id:business.id,labor_method:laborMethod||null,labor_fixed_cents:laborMethod==="fixed"?laborFixed:null,labor_hourly_cents:laborMethod==="hourly"?laborHourly:null,delivery_method:deliveryMethod||null,delivery_fixed_cents:deliveryMethod==="fixed"?deliveryFixed:null,delivery_per_mile_cents:deliveryMethod==="per_mile"?deliveryPerMile:null,delivery_per_drive_hour_cents:deliveryMethod==="per_drive_hour"?deliveryPerDriveHour:null,processing_percent_basis_points:percent,processing_fixed_cents:processingFixed,other_fixed_cents:otherFixed,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:"business_id"});
 if(error)redirect(path(slug,"error","Operating-cost assumptions could not be saved. Apply the equipment profitability migration first."));
 revalidatePath(`/app/${slug}/rental-inventory`);redirect(path(slug,"success","Operating-cost assumptions saved for future completed rentals."));
}

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
 const taxableSetting=text(data,"taxableSetting")||"inherit",taxCode=text(data,"taxCode")||null;
 const lengthFt=optionalPositiveNumber(text(data,"lengthFt"),"length"),widthFt=optionalPositiveNumber(text(data,"widthFt"),"width"),heightFt=optionalPositiveNumber(text(data,"heightFt"),"height");
 const operatorMode=text(data,"operatorMode")||"none",operatorRateRaw=text(data,"operatorHourlyRate"),operatorRate=operatorRateRaw===""?null:Number(operatorRateRaw);
 const outletsRaw=text(data,"powerOutletsRequired"),powerOutletsRequired=outletsRaw===""?0:Number(outletsRaw),powerInstructions=text(data,"powerInstructions")||null;
 if(!name||name.length>120)throw new Error("Enter a rental name up to 120 characters.");
 if(!Number.isFinite(price)||price<0||price>100000)throw new Error("Enter a valid daily rental price.");
 if(purchaseCost!==null&&(!Number.isFinite(purchaseCost)||purchaseCost<0||purchaseCost>10000000))throw new Error("Enter a valid purchase cost.");
 if(!Number.isInteger(stock)||stock<1||stock>10000)throw new Error("Stock quantity must be between 1 and 10,000.");
 if(!["inherit","taxable","nontaxable"].includes(taxableSetting))throw new Error("Choose a valid tax treatment.");
 if(!validStripeTaxCode(taxCode)||taxCode&&taxCode.length>100)throw new Error("Enter a valid Stripe Tax code beginning with txcd_.");
 if(!["none","optional","required"].includes(operatorMode))throw new Error("Choose a valid operator option.");
 if(operatorMode!=="none"&&(!Number.isFinite(operatorRate)||operatorRate===null||operatorRate<0||operatorRate>1000000))throw new Error("Enter a valid operator hourly rate.");
 if(!Number.isInteger(powerOutletsRequired)||powerOutletsRequired<0||powerOutletsRequired>100)throw new Error("Electrical outlets required must be a whole number from 0 to 100.");
 const {data:category}=categoryId?await supabase.from("rental_inventory_categories").select("id,name").eq("id",categoryId).eq("business_id",businessId).maybeSingle():{data:null};
 if(categoryId&&!category)throw new Error("Choose a category that belongs to this business.");
 const overrideType=text(data,"additionalDayPricingTypeOverride"),overrideDiscount=text(data,"additionalDayDiscountPercentOverride"),overrideFlat=text(data,"additionalDayFlatRateOverride"),overrideHours=text(data,"standardRentalHoursOverride"),overrideMax=text(data,"maxRentalDaysOverride");
 const overrideTouched=data.get("usePricingOverride")==="on"||Boolean(overrideHours)||Boolean(overrideDiscount)||Boolean(overrideFlat)||Boolean(overrideMax)||overrideType!=="full_price"||data.get("allowMultiDayOverride")==="on";
 const useOverride=overrideTouched;
 if(useOverride&&(!["full_price","percentage_discount","flat_rate"].includes(overrideType)||!Number.isInteger(Number(overrideHours))||Number(overrideHours)<1||(overrideDiscount&&(Number(overrideDiscount)<0||Number(overrideDiscount)>100))||(overrideFlat&&Number(overrideFlat)<0)||(overrideMax&&Number(overrideMax)<1)))throw new Error("Review the item-specific rental pricing.");
 return {...profitabilityAssumptionsFromForm(data),name,category_id:category?.id??null,category:category?.name??null,description:description||null,daily_price_cents:Math.round(price*100),purchase_cost_cents:purchaseCost===null?null:Math.round(purchaseCost*100),stock_quantity:stock,power_outlets_required:powerOutletsRequired,power_instructions:powerInstructions,length_ft:lengthFt,width_ft:widthFt,height_ft:heightFt,is_taxable:taxableSetting==="inherit"?null:taxableSetting==="taxable",tax_code:taxCode,allow_quantity:data.get("allowQuantity")==="on",active:data.get("active")==="on",standard_rental_hours_override:useOverride?Number(overrideHours):null,allow_multi_day_override:useOverride?data.get("allowMultiDayOverride")==="on":null,additional_day_pricing_type_override:useOverride?overrideType:null,additional_day_discount_percent_override:useOverride&&overrideDiscount?Number(overrideDiscount):null,additional_day_flat_rate_cents_override:useOverride&&overrideFlat?Math.round(Number(overrideFlat)*100):null,max_rental_days_override:useOverride&&overrideMax?Number(overrideMax):null,operator_mode:operatorMode,operator_hourly_rate_cents:operatorMode==="none"?null:Math.round(operatorRate!*100),operator_default_selected:operatorMode==="required"?true:data.get("operatorDefaultSelected")==="on"};
}
async function replaceUpsells(supabase:SupabaseClient,businessId:string,itemId:string,data:FormData){
 const requested=[...new Set(data.getAll("relatedItemIds").map(String).filter(id=>id&&id!==itemId))];
 const {data:valid}=requested.length?await supabase.from("inventory_items").select("id").eq("business_id",businessId).eq("active",true).in("id",requested):{data:[]};
 if((valid??[]).length!==requested.length)throw new Error("One or more upsell items are unavailable.");
 const {error:removeError}=await supabase.from("rental_item_upsells").delete().eq("business_id",businessId).eq("source_item_id",itemId);
 if(removeError)throw new Error("Upsell items could not be saved. Apply the latest rental upsell migration.");
 if(requested.length){const {error}=await supabase.from("rental_item_upsells").insert(requested.map((suggested_item_id,sort_order)=>({business_id:businessId,source_item_id:itemId,suggested_item_id,sort_order})));if(error)throw new Error("Upsell items could not be saved.");}
}

const inventoryImageBucket="inventory-images";
const storagePathFromGalleryUrl=(url:string,businessId:string)=>{try{const parsed=new URL(url),marker=`/storage/v1/object/public/${inventoryImageBucket}/`,index=parsed.pathname.indexOf(marker);if(index<0)return null;const storagePath=decodeURIComponent(parsed.pathname.slice(index+marker.length));return storagePath.startsWith(`${businessId}/`)&&new RegExp(`^[0-9a-f-]{36}/[0-9a-f-]{36}/v1/display\\.webp$`,"i").test(storagePath)?storagePath:"invalid";}catch{return "invalid";}};
async function assertGalleryObjectsExist(businessId:string,urls:string[],legacyUrls:Set<string>){
 const admin=getSupabaseAdmin();if(!admin)throw new Error("Rental photo storage is not configured.");
 for(const url of urls){const storagePath=storagePathFromGalleryUrl(url,businessId);if(storagePath===null){if(!legacyUrls.has(url))throw new Error("Rental photos must be uploaded to this business.");continue;}if(storagePath==="invalid")throw new Error("Rental photo storage path is invalid.");const slash=storagePath.lastIndexOf("/"),folder=storagePath.slice(0,slash),name=storagePath.slice(slash+1),{data,error}=await admin.storage.from(inventoryImageBucket).list(folder,{limit:10,search:name});if(error||!(data??[]).some(object=>object.name===name))throw new Error("One or more rental photo uploads are missing. Upload them again before saving.");}
}
function galleryUrls(data:FormData){const raw=text(data,"rentalImageUrls");if(!raw)return null;let urls:unknown;try{urls=JSON.parse(raw);}catch{throw new Error("Rental photo data is invalid.");}if(!Array.isArray(urls)||urls.length>10||urls.some(url=>typeof url!=="string"||!url.trim()))throw new Error("A rental can have no more than 10 valid photos.");const values=urls.map(url=>(url as string).trim());if(new Set(values).size!==values.length)throw new Error("A rental gallery cannot contain duplicate photos.");return values;}
async function saveGallery(supabase:SupabaseClient,businessId:string,itemId:string,data:FormData){const urls=galleryUrls(data);if(urls===null)return;const submittedId=text(data,"galleryInventoryItemId");if(submittedId&&submittedId!==itemId)throw new Error("Rental photo update did not match this inventory item.");const {data:current,error:currentError}=await supabase.from("inventory_items").select("image_url,image_urls,rental_item_images(image_url)").eq("id",itemId).eq("business_id",businessId).maybeSingle();if(currentError||!current)throw new Error("This rental is unavailable for photo updates.");const legacyUrls=new Set([current.image_url,...(current.image_urls??[]),...((current.rental_item_images??[]).map((image:{image_url:string})=>image.image_url))].filter((url):url is string=>typeof url==="string"&&storagePathFromGalleryUrl(url,businessId)===null));await assertGalleryObjectsExist(businessId,urls,legacyUrls);const expected=text(data,"galleryExpectedUpdatedAt")||null;const {error}=await supabase.rpc("replace_rental_item_images",{p_item_id:itemId,p_business_id:businessId,p_urls:urls,p_expected_updated_at:expected});if(error)throw new Error(error.message.includes("another editor")?"This rental was changed by another editor. Refresh before saving photos.":"Rental photos could not be saved.");}

export async function createRentalItem(slug:string,data:FormData){
 const {supabase,business}=await context(slug);
 try{
  const payload=await values(supabase,business.id,data),receiptPath=directPath(data,"uploadedReceiptPath",business.id),admin=getSupabaseAdmin();
  const {data:item,error}=await supabase.from("inventory_items").insert({...payload,business_id:business.id,slug:`${slugify(payload.name)||"rental"}-${crypto.randomUUID().slice(0,8)}`,purchase_receipt_path:receiptPath,purchase_receipt_name:text(data,"uploadedReceiptName")||null}).select("id").single();
  if(error&&receiptPath){await admin?.storage.from("rental-purchase-receipts").remove([receiptPath]);}
  if(error||!item)throw new Error(error?.code==="23505"?"A rental with that identifier already exists.":"The rental item could not be added. Apply the rental inventory migration first.");
  await saveGallery(supabase,business.id,item.id,data);
  await replaceUpsells(supabase,business.id,item.id,data);
 }catch(error){redirect(path(slug,"error",error instanceof Error?error.message:"The rental item could not be added."));}
 revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/book`);redirect(path(slug,"success","Rental item added."));
}

export async function updateRentalItem(slug:string,itemId:string,data:FormData){
 const {supabase,business}=await context(slug);
 try{
  const payload=await values(supabase,business.id,data),receiptPath=directPath(data,"uploadedReceiptPath",business.id),admin=getSupabaseAdmin();
  if(text(data,"powerOutletsRequired")===""){delete (payload as {power_outlets_required?:number}).power_outlets_required;delete (payload as {power_instructions?:string|null}).power_instructions;}
  const {data:existing}=await supabase.from("inventory_items").select("purchase_receipt_path,image_url").eq("id",itemId).eq("business_id",business.id).maybeSingle();
  const removeReceipt=data.get("removePurchaseReceipt")==="on";
  const receiptFields=receiptPath?{purchase_receipt_path:receiptPath,purchase_receipt_name:text(data,"uploadedReceiptName")||null}:removeReceipt?{purchase_receipt_path:null,purchase_receipt_name:null}:{};
  await saveGallery(supabase,business.id,itemId,data);
  const {error}=await supabase.from("inventory_items").update({...payload,...receiptFields}).eq("id",itemId).eq("business_id",business.id);
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

export async function saveRentalPowerRequirements(slug:string,itemId:string,data:FormData){
 const {supabase,business}=await context(slug),raw=text(data,"powerOutletsRequired"),outlets=Number(raw),instructions=text(data,"powerInstructions")||null;
 if(!Number.isInteger(outlets)||outlets<0||outlets>100)redirect(path(slug,"error","Electrical outlets required must be a whole number from 0 to 100."));
 const {error}=await supabase.from("inventory_items").update({power_outlets_required:outlets,power_instructions:instructions}).eq("id",itemId).eq("business_id",business.id);
 if(error)redirect(path(slug,"error","Power requirements could not be saved. Apply the rental power requirements migration first."));
 revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/book/${slug}`);redirect(path(slug,"success","Electrical requirements saved."));
}

export async function saveThemedBanner(slug:string,data:FormData){
 const {supabase,business}=await context(slug);
 try{
  const bannerId=text(data,"bannerId")||null,catalogId=text(data,"catalogId")||null,name=text(data,"name"),description=text(data,"description")||null,price=parseCurrencyToCents(text(data,"price")),quantity=Number(text(data,"physicalQuantity")),uploadedImagePath=directPath(data,"uploadedBannerImagePath",business.id),availableFrom=text(data,"availableFrom")||null,availableUntil=text(data,"availableUntil")||null,compatibleItemIds=[...new Set(data.getAll("compatibleItemId").map(String).filter(Boolean))];
  const admin=getSupabaseAdmin(),imageUrl=uploadedImagePath&&admin?admin.storage.from("inventory-images").getPublicUrl(uploadedImagePath).data.publicUrl:null;
  if(!name||name.length>160||price===null||price<0||price>2147483647||!Number.isInteger(quantity)||quantity<1||quantity>10000)throw new Error("Enter a banner name, valid price, and quantity.");
  if(availableFrom&&!datePattern.test(availableFrom)||availableUntil&&!datePattern.test(availableUntil)||availableFrom&&availableUntil&&availableUntil<availableFrom)throw new Error("Choose a valid banner availability date range.");
  const {data:validItems}=compatibleItemIds.length?await supabase.from("inventory_items").select("id").eq("business_id",business.id).eq("active",true).in("id",compatibleItemIds):{data:[]};
  if(!compatibleItemIds.length||(validItems??[]).length!==compatibleItemIds.length)throw new Error("Choose at least one active inflatable that can use this banner.");
  let resolvedCatalogId=catalogId,resolvedBannerId=bannerId;
  if(bannerId&&catalogId){
   const {data:existing}=await supabase.from("rental_themed_banners").select("id,catalog_id").eq("id",bannerId).eq("business_id",business.id).maybeSingle();
   if(!existing||existing.catalog_id!==catalogId)throw new Error("Banner not found.");
   const {error:catalogError}=await supabase.from("job_addon_catalog").update({name,description,default_unit_price_cents:price,is_taxable:data.get("isTaxable")==="on",...(imageUrl?{image_url:imageUrl}:{}),is_active:data.get("active")==="on",customer_visible:data.get("active")==="on",visibility:"public_future",max_customer_quantity:1,updated_at:new Date().toISOString()}).eq("id",catalogId).eq("business_id",business.id);
   if(catalogError)throw new Error("Banner details could not be saved.");
   const {error:bannerError}=await supabase.from("rental_themed_banners").update({physical_quantity:quantity,available_from:availableFrom,available_until:availableUntil,updated_at:new Date().toISOString()}).eq("id",bannerId).eq("business_id",business.id);
   if(bannerError)throw new Error("Banner availability could not be saved.");
  }else{
   const {data:catalog,error:catalogError}=await supabase.from("job_addon_catalog").insert({business_id:business.id,name,description,default_unit_price_cents:price,is_taxable:data.get("isTaxable")==="on",image_url:imageUrl,is_active:data.get("active")==="on",customer_visible:data.get("active")==="on",visibility:"public_future",max_customer_quantity:1,compatibility_required:false}).select("id").single();
   if(catalogError||!catalog)throw new Error(catalogError?.code==="23505"?"A banner with that name already exists.":"Banner details could not be saved. Apply the themed-banner migration first.");
   resolvedCatalogId=catalog.id;
   const {data:banner,error:bannerError}=await supabase.from("rental_themed_banners").insert({business_id:business.id,catalog_id:catalog.id,physical_quantity:quantity,available_from:availableFrom,available_until:availableUntil}).select("id").single();
   if(bannerError||!banner){await supabase.from("job_addon_catalog").delete().eq("id",catalog.id).eq("business_id",business.id);throw new Error("Banner availability could not be saved. Apply the themed-banner migration first.");}
   resolvedBannerId=banner.id;
  }
  const {error:removeError}=await supabase.from("rental_themed_banner_compatible_inventory").delete().eq("banner_id",resolvedBannerId!).eq("business_id",business.id);
  if(removeError)throw new Error("Banner compatibility could not be saved.");
  const {error:compatibilityError}=await supabase.from("rental_themed_banner_compatible_inventory").insert(compatibleItemIds.map(inventory_item_id=>({banner_id:resolvedBannerId,business_id:business.id,inventory_item_id})));
  if(compatibilityError)throw new Error("Banner compatibility could not be saved.");
 }catch(error){redirect(path(slug,"error",error instanceof Error?error.message:"The banner could not be saved."));}
 revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/book/${slug}`);redirect(path(slug,"success","Add-on banner saved."));
}

export async function archiveThemedBanner(slug:string,bannerId:string){
 const {supabase,business}=await context(slug);
 const {data:banner}=await supabase.from("rental_themed_banners").select("catalog_id").eq("id",bannerId).eq("business_id",business.id).maybeSingle();
 if(!banner)redirect(path(slug,"error","Banner not found."));
 const {error}=await supabase.from("job_addon_catalog").update({is_active:false,customer_visible:false,updated_at:new Date().toISOString()}).eq("id",banner.catalog_id).eq("business_id",business.id);
 if(error)redirect(path(slug,"error","The banner could not be hidden."));
 revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/book/${slug}`);redirect(path(slug,"success","Banner hidden from online booking."));
}

export async function saveRentalInventoryRequirements(slug:string,itemId:string,data:FormData){
 const {supabase,business}=await context(slug),resourceIds=[...new Set(data.getAll("includedInventoryItemIds").map(String).filter(Boolean))];
 if(!resourceIds.length)redirect(path(slug,"error","Choose at least one physical inventory item for this rental."));
 const {error}=await supabase.rpc("replace_rental_listing_inventory_requirements",{p_business_id:business.id,p_listing_inventory_item_id:itemId,p_resource_inventory_item_ids:resourceIds});
 if(error){
  console.error("Included rental inventory save failed",{businessId:business.id,itemId,code:error.code??null,message:error.message??null});
  const message=/permission_denied|42501/i.test(`${error.code} ${error.message}`)?"Only owners and administrators can link included inventory.":/PGRST202|replace_rental_listing_inventory_requirements/i.test(`${error.code} ${error.message}`)?"Included inventory setup is incomplete. Apply the latest shared inventory fix migration.":/invalid_included_inventory|rental_listing_not_found/i.test(error.message??"")?"One of the selected inventory items is no longer available. Refresh and try again.":"Included inventory could not be saved. Please try again.";
  redirect(path(slug,"error",message));
 }
 revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/book/${slug}`);redirect(path(slug,"success","Included inventory updated."));
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
 const {supabase,business}=await context(slug);const name=text(data,"name"),sortOrder=Number(text(data,"sortOrder")||0),taxCode=text(data,"taxCode")||null;
 if(!name||name.length>80)redirect(path(slug,"error","Enter a category name up to 80 characters."));
 if(!validStripeTaxCode(taxCode))redirect(path(slug,"error","Enter a valid Stripe Tax code beginning with txcd_."));
 const {error}=await supabase.from("rental_inventory_categories").insert({business_id:business.id,name,tax_code:taxCode,sort_order:Number.isInteger(sortOrder)?sortOrder:0});
 if(error)redirect(path(slug,"error",error.code==="23505"?"That category already exists.":"The category could not be created. Apply the latest rental category migration."));
 revalidatePath(`/app/${slug}/rental-inventory`);redirect(path(slug,"success","Rental category created."));
}

export async function createCategoryWebsitePage(slug:string,categoryId:string){const {supabase,business,role}=await context(slug);if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can create website pages."));const [{data:category},{data:existing}]=await Promise.all([supabase.from("rental_inventory_categories").select("id,name").eq("id",categoryId).eq("business_id",business.id).maybeSingle(),supabase.from("category_website_pages").select("id,status").eq("business_id",business.id).eq("category_id",categoryId).maybeSingle()]);if(!category)redirect(path(slug,"error","Category not found."));if(existing)redirect(path(slug,"success",`This category already has a ${existing.status} landing page.`));const pageSlug=slugify(category.name);const {error}=await supabase.from("category_website_pages").insert({business_id:business.id,category_id:category.id,slug:pageSlug,title:category.name,intro:`Browse all ${category.name.toLowerCase()} available from ${business.name}, then check availability for your event date.`,seo_title:`${category.name} | ${business.name}`,meta_description:`Explore ${category.name.toLowerCase()} from ${business.name} and check availability online.`});if(error)redirect(path(slug,"error",error.code==="23505"?"A page already uses that URL. Rename the category or choose another page URL.":"The website page could not be created."));revalidatePath(`/app/${slug}/rental-inventory`);redirect(path(slug,"success","Category landing page draft created. Publish it when you are ready."));}
export async function publishCategoryWebsitePage(slug:string,pageId:string){const {supabase,business,role}=await context(slug);if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can publish website pages."));const {data:page,error}=await supabase.from("category_website_pages").update({status:"published",published_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",pageId).eq("business_id",business.id).select("slug").maybeSingle();if(error||!page)redirect(path(slug,"error","The category landing page could not be published."));revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/sites/[siteSlug]/${page.slug}`);revalidatePath(`/sites/domain/[domain]/${page.slug}`);redirect(path(slug,"success","Category landing page published."));}

export async function updateCategoryWebsitePage(slug:string,pageId:string,data:FormData){
 const {supabase,business,role}=await context(slug);
 if(!canManageBusiness(role))redirect(path(slug,"error","Only owners and administrators can edit website pages."));
 const title=text(data,"title"),intro=text(data,"intro"),seoTitle=text(data,"seoTitle"),metaDescription=text(data,"metaDescription");
 if(!title||title.length>140||!intro||intro.length>3000||!seoTitle||seoTitle.length>180||!metaDescription||metaDescription.length>320)redirect(path(slug,"error","Enter a title, content, SEO title, and meta description within the displayed limits."));
 const {data:page,error}=await supabase.from("category_website_pages").update({title,intro,seo_title:seoTitle,meta_description:metaDescription,updated_at:new Date().toISOString()}).eq("id",pageId).eq("business_id",business.id).select("slug").maybeSingle();
 if(error||!page)redirect(path(slug,"error","The category website page could not be updated."));
 revalidatePath(`/app/${slug}/rental-inventory`);revalidatePath(`/sites/[siteSlug]/${page.slug}`);revalidatePath(`/sites/domain/[domain]/${page.slug}`);
 redirect(path(slug,"success","Category website page updated."));
}

export async function updateRentalCategory(slug:string,categoryId:string,data:FormData){
 const {supabase,business}=await context(slug);const name=text(data,"name"),sortOrder=Number(text(data,"sortOrder")||0),taxCode=text(data,"taxCode")||null;
 if(!name||name.length>80)redirect(path(slug,"error","Enter a category name up to 80 characters."));
 if(!validStripeTaxCode(taxCode))redirect(path(slug,"error","Enter a valid Stripe Tax code beginning with txcd_."));
 const {error}=await supabase.from("rental_inventory_categories").update({name,tax_code:taxCode,sort_order:Number.isInteger(sortOrder)?sortOrder:0,updated_at:new Date().toISOString()}).eq("id",categoryId).eq("business_id",business.id);
 if(error)redirect(path(slug,"error",error.code==="23505"?"That category already exists.":"The category could not be updated."));
 await supabase.from("inventory_items").update({category:name}).eq("business_id",business.id).eq("category_id",categoryId);
 revalidatePath(`/app/${slug}/rental-inventory`);redirect(path(slug,"success","Rental category updated."));
}

export async function bulkSetRentalTaxCode(slug:string,data:FormData){
 const {supabase,business}=await context(slug),scope=text(data,"scope"),taxCode=text(data,"taxCode")||null,categoryId=text(data,"categoryId");
 if(!validStripeTaxCode(taxCode))redirect(path(slug,"error","Enter a valid Stripe Tax code beginning with txcd_."));
 let query=supabase.from("inventory_items").update({tax_code:taxCode}).eq("business_id",business.id);
 if(scope==="category"){
  if(!categoryId)redirect(path(slug,"error","Choose a category for the bulk update."));
  query=query.eq("category_id",categoryId);
 }else if(scope==="selected"){
  const ids=[...new Set(data.getAll("itemIds").map(String).filter(Boolean))];
  if(!ids.length)redirect(path(slug,"error","Choose at least one rental item."));
  query=query.in("id",ids);
 }else if(scope!=="all")redirect(path(slug,"error","Choose a valid bulk-update scope."));
 const {error}=await query;
 if(error)redirect(path(slug,"error","Rental tax codes could not be updated."));
 revalidatePath(`/app/${slug}/rental-inventory`);redirect(path(slug,"success","Rental tax-code overrides updated."));
}

export async function setRentalCategoryTaxCode(slug:string,data:FormData){
 const {supabase,business}=await context(slug),categoryId=text(data,"categoryId"),taxCode=text(data,"taxCode")||null;
 if(!categoryId)redirect(path(slug,"error","Choose a rental category."));
 if(!validStripeTaxCode(taxCode))redirect(path(slug,"error","Enter a valid Stripe Tax code beginning with txcd_."));
 const {error}=await supabase.from("rental_inventory_categories").update({tax_code:taxCode,updated_at:new Date().toISOString()}).eq("id",categoryId).eq("business_id",business.id);
 if(error)redirect(path(slug,"error","The category tax-code override could not be saved."));
 revalidatePath(`/app/${slug}/rental-inventory`);redirect(path(slug,"success","Category tax-code override saved."));
}

export async function deleteRentalCategory(slug:string,categoryId:string,data:FormData){
 const {supabase,business}=await context(slug);const replacementId=text(data,"replacementCategoryId")||null;
 const {data:count,error}=await supabase.rpc("delete_rental_inventory_category",{p_business_id:business.id,p_category_id:categoryId,p_replacement_category_id:replacementId});
 if(error)redirect(path(slug,"error",error.message||"The category could not be deleted."));
 revalidatePath(`/app/${slug}/rental-inventory`);redirect(path(slug,"success",`Category deleted${Number(count)>0?` and ${count} item${Number(count)===1?"":"s"} reassigned`:""}.`));
}
