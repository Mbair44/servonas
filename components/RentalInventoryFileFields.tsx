"use client";

import {useState,type ChangeEvent} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabaseBrowser";
import {prepareRentalUpload} from "@/app/app/[businessSlug]/rental-inventory/actions";

const MB=1024*1024;
const imageTypes=new Set(["image/jpeg","image/png","image/webp"]);
const receiptTypes=new Set(["application/pdf","image/jpeg","image/png","image/webp"]);

export function RentalInventoryFileFields({receiptUrl,receiptName}:{receiptUrl?:string;receiptName?:string|null}){
 const [imageError,setImageError]=useState(""),[receiptError,setReceiptError]=useState(""),[imagePath,setImagePath]=useState(""),[receiptPath,setReceiptPath]=useState(""),[newReceiptName,setNewReceiptName]=useState(""),[uploading,setUploading]=useState<"image"|"receipt"|null>(null);
 async function upload(event:ChangeEvent<HTMLInputElement>,kind:"image"|"receipt"){
  const file=event.target.files?.[0],limit=kind==="image"?8:10,types=kind==="image"?imageTypes:receiptTypes,setError=kind==="image"?setImageError:setReceiptError;
  if(!file){setError("");return;}
  if(!types.has(file.type)){setError(`“${file.name}” is not a supported file type.`);event.target.value="";return;}
  if(file.size>limit*MB){setError(`“${file.name}” is ${(file.size/MB).toFixed(1)} MB. Choose a file ${limit} MB or smaller.`);event.target.value="";return;}
  setUploading(kind);setError("");
  try{
   const businessSlug=decodeURIComponent(window.location.pathname.split("/")[2]??"");
   if(!businessSlug)throw new Error("The workspace could not be identified. Refresh and try again.");
   const target=await prepareRentalUpload(businessSlug,kind,file.name,file.type,file.size);
   const {error}=await createSupabaseBrowserClient().storage.from(target.bucket).uploadToSignedUrl(target.path,target.token,file,{contentType:file.type});
   if(error)throw error;
   if(kind==="image")setImagePath(target.path);else{setReceiptPath(target.path);setNewReceiptName(target.name);}
  }catch(error){setError(error instanceof Error?error.message:"The file could not be uploaded. Please try again.");event.target.value="";}
  finally{setUploading(null);}
 }
 return <>
  <label>Rental image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading!==null} onChange={event=>void upload(event,"image")}/><input type="hidden" name="uploadedImagePath" value={imagePath}/><small>{uploading==="image"?"Uploading image…":imagePath?"Image uploaded. Save the rental item to apply it.":"JPG, PNG, or WebP. Maximum file size: 8 MB."}</small>{imageError&&<span className="rental-file-error" role="alert">{imageError}</span>}</label>
  <label className="wide rental-receipt-field">Purchase receipt<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={uploading!==null} onChange={event=>void upload(event,"receipt")}/><input type="hidden" name="uploadedReceiptPath" value={receiptPath}/><input type="hidden" name="uploadedReceiptName" value={newReceiptName}/><small>{uploading==="receipt"?"Uploading receipt…":receiptPath?"Receipt uploaded. Save the rental item to apply it.":"PDF, JPG, PNG, or WebP. Maximum file size: 10 MB. Stored privately."}</small>{receiptError&&<span className="rental-file-error" role="alert">{receiptError}</span>}{receiptUrl&&<span><a href={receiptUrl} target="_blank" rel="noreferrer">View current receipt{receiptName?` · ${receiptName}`:""}</a><span className="rental-remove-receipt"><input type="checkbox" name="removePurchaseReceipt"/> Remove current receipt</span></span>}</label>
 </>;
}
