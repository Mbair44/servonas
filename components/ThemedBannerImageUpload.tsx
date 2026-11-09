"use client";

import {useState,type ChangeEvent} from "react";
import {prepareRentalUpload} from "@/app/app/[businessSlug]/rental-inventory/actions";
import {createSupabaseBrowserClient} from "@/lib/supabaseBrowser";
import {optimizeImageForUpload,validateOptimizableImage} from "@/lib/browserImageOptimizer";

const imageTypes=new Set(["image/jpeg","image/png","image/webp"]);

export function ThemedBannerImageUpload({currentUrl}:{currentUrl?:string|null}){
 const [path,setPath]=useState(""),[error,setError]=useState(""),[uploading,setUploading]=useState(false);
 async function upload(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];if(!file){setError("");return;}if(!imageTypes.has(file.type)){setError("Choose a JPG, PNG, or WebP image.");event.target.value="";return;}
  setUploading(true);setError("");
  try{const slug=decodeURIComponent(window.location.pathname.split("/")[2]??"");if(!slug)throw new Error("The workspace could not be identified.");validateOptimizableImage(file,imageTypes,12*1024*1024);const target=await prepareRentalUpload(slug,"image",file.name,file.type,file.size) as {bucket:string;cacheControl:string;display?:{path:string;token:string};thumb?:{path:string;token:string}};if(!target.display||!target.thumb)throw new Error("The image upload could not be prepared.");const image=await optimizeImageForUpload(file,{maxSourceBytes:12*1024*1024,maxDisplayLongEdge:1920,maxThumbLongEdge:560,quality:.78}),storage=createSupabaseBrowserClient().storage.from(target.bucket),[display,thumb]=await Promise.all([storage.uploadToSignedUrl(target.display.path,target.display.token,image.display,{contentType:image.display.type,cacheControl:target.cacheControl}),storage.uploadToSignedUrl(target.thumb.path,target.thumb.token,image.thumb,{contentType:image.thumb.type,cacheControl:target.cacheControl})]);if(display.error||thumb.error)throw display.error??thumb.error;setPath(target.display.path);
  }catch(value){setError(value instanceof Error?value.message:"The banner image could not be uploaded.");event.target.value="";}finally{setUploading(false);}
 }
 return <label>Banner picture<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={event=>void upload(event)}/><input type="hidden" name="uploadedBannerImagePath" value={path}/><small>{uploading?"Uploading picture…":path?"Picture uploaded. Save the banner to use it.":currentUrl?"Upload a replacement picture, or leave this unchanged.":"JPG, PNG, or WebP. Maximum file size: 8 MB."}</small>{currentUrl&&<img src={currentUrl} alt="Current banner" style={{maxWidth:160,maxHeight:100,objectFit:"cover",display:"block",marginTop:8}}/>}{error&&<span className="rental-file-error" role="alert">{error}</span>}</label>;
}
