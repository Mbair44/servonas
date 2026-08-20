"use client";

import {useState,type ChangeEvent} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabaseBrowser";
import {prepareRentalUpload} from "@/app/app/[businessSlug]/rental-inventory/actions";
import {optimizeImageForUpload,validateOptimizableImage} from "@/lib/browserImageOptimizer";

const MB=1024*1024;
const imageTypes=new Set(["image/jpeg","image/png","image/webp"]);
const receiptTypes=new Set(["application/pdf","image/jpeg","image/png","image/webp"]);

export function RentalInventoryFileFields({receiptUrl,receiptName}:{receiptUrl?:string;receiptName?:string|null}){
 const [imageError,setImageError]=useState(""),[receiptError,setReceiptError]=useState(""),[imagePath,setImagePath]=useState(""),[receiptPath,setReceiptPath]=useState(""),[newReceiptName,setNewReceiptName]=useState(""),[uploading,setUploading]=useState<"image"|"receipt"|null>(null);
 async function upload(event:ChangeEvent<HTMLInputElement>,kind:"image"|"receipt"){
  const file=event.target.files?.[0],limit=kind==="image"?8:10,types=kind==="image"?imageTypes:receiptTypes,setError=kind==="image"?setImageError:setReceiptError;
  if(!file){setError("");return;}
  if(!types.has(file.type)){setError(`“${file.name}” is not a supported file type.`);event.target.value="";return;}
  if(file.size>limit*MB&&kind==="receipt"){setError(`“${file.name}” is ${(file.size/MB).toFixed(1)} MB. Choose a file ${limit} MB or smaller.`);event.target.value="";return;}
  setUploading(kind);setError("");
  try{
   const businessSlug=decodeURIComponent(window.location.pathname.split("/")[2]??"");
   if(!businessSlug)throw new Error("The workspace could not be identified. Refresh and try again.");
   const target=await prepareRentalUpload(businessSlug,kind,file.name,file.type,file.size);
   if(kind==="image"){
    const imageTarget=target as {bucket:string;cacheControl:string;display?:{path:string;token:string};thumb?:{path:string;token:string}};
    if(!imageTarget.display||!imageTarget.thumb)throw new Error("The image upload could not be prepared. Please try again.");
    validateOptimizableImage(file,imageTypes,12*MB);
    const optimized=await optimizeImageForUpload(file,{maxSourceBytes:12*MB,maxDisplayLongEdge:1920,maxThumbLongEdge:560,quality:.78});
    const storage=createSupabaseBrowserClient().storage.from(imageTarget.bucket);
    const [displayUpload,thumbUpload]=await Promise.all([
     storage.uploadToSignedUrl(imageTarget.display.path,imageTarget.display.token,optimized.display,{contentType:optimized.display.type,cacheControl:imageTarget.cacheControl}),
     storage.uploadToSignedUrl(imageTarget.thumb.path,imageTarget.thumb.token,optimized.thumb,{contentType:optimized.thumb.type,cacheControl:imageTarget.cacheControl}),
    ]);
    if(displayUpload.error||thumbUpload.error)throw displayUpload.error??thumbUpload.error;
    console.info("image_upload_optimized",{source:"rental_inventory_image",originalBytes:optimized.originalBytes,displayBytes:optimized.displayBytes,thumbnailBytes:optimized.thumbBytes,compressionRatio:Number(optimized.compressionRatio.toFixed(4)),tenantId:businessSlug});
    setImagePath(imageTarget.display.path);
   }else{
    const receiptTarget=target as {bucket:string;path?:string;token?:string;name?:string};
    if(!receiptTarget.path||!receiptTarget.token||!receiptTarget.name)throw new Error("The receipt upload could not be prepared. Please try again.");
    if(file.size>limit*MB)throw new Error(`“${file.name}” is ${(file.size/MB).toFixed(1)} MB. Choose a file ${limit} MB or smaller.`);
    const {error}=await createSupabaseBrowserClient().storage.from(receiptTarget.bucket).uploadToSignedUrl(receiptTarget.path,receiptTarget.token,file,{contentType:file.type});
    if(error)throw error;
    setReceiptPath(receiptTarget.path);setNewReceiptName(receiptTarget.name);
   }
  }catch(error){setError(error instanceof Error?error.message:"The file could not be uploaded. Please try again.");event.target.value="";}
  finally{setUploading(null);}
 }
 return <>
  <label>Rental image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading!==null} onChange={event=>void upload(event,"image")}/><input type="hidden" name="uploadedImagePath" value={imagePath}/><small>{uploading==="image"?"Uploading image…":imagePath?"Image uploaded. Save the rental item to apply it.":"JPG, PNG, or WebP. Maximum file size: 8 MB."}</small>{imageError&&<span className="rental-file-error" role="alert">{imageError}</span>}</label>
  <label className="wide rental-receipt-field">Purchase receipt<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={uploading!==null} onChange={event=>void upload(event,"receipt")}/><input type="hidden" name="uploadedReceiptPath" value={receiptPath}/><input type="hidden" name="uploadedReceiptName" value={newReceiptName}/><small>{uploading==="receipt"?"Uploading receipt…":receiptPath?"Receipt uploaded. Save the rental item to apply it.":"PDF, JPG, PNG, or WebP. Maximum file size: 10 MB. Stored privately."}</small>{receiptError&&<span className="rental-file-error" role="alert">{receiptError}</span>}{receiptUrl&&<span><a href={receiptUrl} target="_blank" rel="noreferrer">View current receipt{receiptName?` · ${receiptName}`:""}</a><span className="rental-remove-receipt"><input type="checkbox" name="removePurchaseReceipt"/> Remove current receipt</span></span>}</label>
 </>;
}
