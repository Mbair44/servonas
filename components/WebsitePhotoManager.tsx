"use client";

import {useState,type ChangeEvent} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabaseBrowser";
import {prepareWebsitePhotoUpload} from "@/app/app/[businessSlug]/settings/website/actions";

const MB=1024*1024,MAX_BYTES=8*MB;
const supportedTypes=new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif"]);
const phoneTypes=new Set(["image/heic","image/heif"]);
const phoneName=(name:string)=>/\.(heic|heif)$/i.test(name);

async function jpegFromPhonePhoto(file:File){
 const source=URL.createObjectURL(file);
 try{
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const value=new Image();value.onload=()=>resolve(value);value.onerror=()=>reject(new Error("This phone photo could not be converted. On iPhone, choose Most Compatible under Settings → Camera → Formats, then try again."));value.src=source;});
  const scale=Math.min(1,2400/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  canvas.getContext("2d")?.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.82));
  if(!blob)throw new Error("This phone photo could not be prepared. Please choose a different photo.");
  return new File([blob],file.name.replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg",lastModified:file.lastModified});
 }finally{URL.revokeObjectURL(source);}
}

export function WebsitePhotoManager({photos=[],disabled=false}:{photos?:string[];disabled?:boolean}){
 const [items,setItems]=useState(photos),[pending,setPending]=useState<{url:string;index:number}|null>(null),[uploading,setUploading]=useState(false),[uploadError,setUploadError]=useState("");
 const remove=()=>{if(!pending)return;setItems(current=>current.filter(url=>url!==pending.url));setPending(null);};
 async function upload(event:ChangeEvent<HTMLInputElement>){
  const selected=Array.from(event.target.files??[]);event.target.value="";setUploadError("");
  if(!selected.length)return;
  if(selected.length>6){setUploadError("Choose up to 6 photos at a time.");return;}
  if(items.length+selected.length>12){setUploadError(`This website can display 12 photos. You can add ${Math.max(0,12-items.length)} more.`);return;}
  const businessSlug=decodeURIComponent(window.location.pathname.split("/")[2]??"");
  if(!businessSlug){setUploadError("The workspace could not be identified. Refresh and try again.");return;}
  setUploading(true);
  try{
   const uploaded:string[]=[];
   for(const original of selected){
    let file=original;
    const isPhoneFormat=phoneTypes.has(file.type)||phoneName(file.name);
    if(isPhoneFormat||file.size>MAX_BYTES){
     if(file.type==="image/gif")throw new Error(`“${file.name}” is ${(file.size/MB).toFixed(1)} MB. Choose a GIF smaller than 8 MB.`);
     file=await jpegFromPhonePhoto(file);
    }
    if(!supportedTypes.has(file.type))throw new Error(`“${original.name}” is not a supported photo. Choose a JPG, PNG, WebP, GIF, AVIF, HEIC, or HEIF image.`);
    if(file.size>MAX_BYTES)throw new Error(`“${original.name}” is still too large after optimization. Choose a smaller photo.`);
    const target=await prepareWebsitePhotoUpload(businessSlug,file.name,file.type,file.size);
    const {error}=await createSupabaseBrowserClient().storage.from(target.bucket).uploadToSignedUrl(target.path,target.token,file,{contentType:file.type});
    if(error)throw new Error("The photo could not be uploaded. Check your connection and try again.");
    uploaded.push(target.url);
   }
   setItems(current=>[...new Set([...current,...uploaded])].slice(0,12));
  }catch(error){setUploadError(error instanceof Error?error.message:"The photos could not be uploaded. Please try again.");}
  finally{setUploading(false);}
 }
 return <div className="website-photo-manager">
  <textarea className="website-photo-values" name="photoUrls" value={items.join("\n")} readOnly aria-hidden="true" tabIndex={-1}/>
  {items.length?<div className="website-photo-previews">{items.map((url,index)=><figure key={url}><img src={url} alt={`Website photo ${index+1}`}/>{!disabled&&<button type="button" className="website-photo-delete" onClick={()=>setPending({url,index})} aria-label={`Remove website photo ${index+1}`} title="Remove photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button>}<figcaption>{index===0?"Hero photo":index===1?"About photo":`Gallery photo ${index-1}`}</figcaption></figure>)}</div>:<div className="website-photo-empty"><strong>No website photos yet</strong><span>Upload photos to personalize your website.</span></div>}
  <label className="website-photo-upload">Upload photos <small>{uploading?"Preparing and uploading photos…":"Phone photos supported, including HEIC. Up to 6 at a time; large camera photos are optimized automatically."}</small><input type="file" accept="image/*,.heic,.heif" multiple disabled={disabled||uploading} onChange={event=>void upload(event)}/></label>
  {uploadError&&<span className="website-photo-error" role="alert">{uploadError}</span>}
  <small>The first photo is used in the hero, the second appears in About, and the remaining photos build the gallery.</small>
  {pending&&<div className="website-photo-confirm-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPending(null);}}><section role="dialog" aria-modal="true" aria-labelledby="remove-website-photo-title"><div className="website-photo-confirm-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg></div><h3 id="remove-website-photo-title">Remove this photo?</h3><p>It will stop appearing on the website after you select <strong>Save &amp; Continue</strong>.</p><img src={pending.url} alt={`Photo ${pending.index+1} selected for removal`}/><div><button type="button" className="sv-button sv-secondary" onClick={()=>setPending(null)}>Keep photo</button><button type="button" className="sv-button sv-danger" onClick={remove}>Remove photo</button></div></section></div>}
 </div>;
}
