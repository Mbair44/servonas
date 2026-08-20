"use client";

import {useEffect, useMemo, useState,type ChangeEvent} from "react";
import {createSupabaseBrowserClient} from "@/lib/supabaseBrowser";
import {discardWebsiteAiPhotoSafe,generateWebsiteAiPhotoSafe,openWebsiteAiImageGeneratorSafe,prepareWebsitePhotoUpload,saveWebsiteAiPhotoSafe} from "@/app/app/[businessSlug]/settings/website/actions";
import {websiteAiImageTypes,type WebsiteAiImageType} from "@/lib/websiteAiImages";
import {optimizeImageForUpload,validateOptimizableImage} from "@/lib/browserImageOptimizer";
import {storageImageThumbUrl} from "@/lib/storageImageVariants";

const MB=1024*1024,MAX_SOURCE_BYTES=12*MB,MAX_UPLOAD_COUNT=12;
const supportedTypes=new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif"]);
const phoneTypes=new Set(["image/heic","image/heif"]);
const phoneName=(name:string)=>/\.(heic|heif)$/i.test(name);
type PhotoItem={url:string;usage:string;index:number};
type UploadState={name:string;status:"queued"|"uploading"|"done"|"error";error?:string};
type AiDraft={generationId:string;imageUrl:string;imageType:WebsiteAiImageType};
type AiStatus="idle"|"generating"|"ready"|"saving";
const imageTypeLabels:Record<WebsiteAiImageType,string>={
 hero_banner:"Hero / banner image",
 professional_at_work:"Professional at work",
 service_being_performed:"Service being performed",
 equipment_tools:"Equipment / tools",
 before_after:"Before & after",
 custom_description:"Custom description",
};

async function jpegFromPhonePhoto(file:File){
 const source=URL.createObjectURL(file);
 try{
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const value=new Image();value.onload=()=>resolve(value);value.onerror=()=>reject(new Error("This phone photo could not be converted. On iPhone, choose Most Compatible under Settings → Camera → Formats, then try again."));value.src=source;});
  const scale=Math.min(1,1920/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  canvas.getContext("2d")?.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",.82));
  if(!blob)throw new Error("This phone photo could not be prepared. Please choose a different photo.");
  return new File([blob],file.name.replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg",lastModified:file.lastModified});
 }finally{URL.revokeObjectURL(source);}
}

function getUsage(index:number,photoCount:number){
 if(index===0) return "HERO";
 if(index===1) return "ABOUT";
 if(index<photoCount) return "GALLERY";
 return "";
}

export function WebsitePhotoManager({photos=[],disabled=false}:{photos?:string[];disabled?:boolean}){
 const [items,setItems]=useState(photos),[pendingRemove,setPendingRemove]=useState<PhotoItem|null>(null),[selected,setSelected]=useState<string[]>([]),[previewIndex,setPreviewIndex]=useState<number|null>(null),[libraryOpen,setLibraryOpen]=useState(false),[uploading,setUploading]=useState(false),[uploadError,setUploadError]=useState(""),[uploadStates,setUploadStates]=useState<UploadState[]>([]),[aiOpen,setAiOpen]=useState(false),[aiType,setAiType]=useState<WebsiteAiImageType>("hero_banner"),[aiDescription,setAiDescription]=useState(""),[aiStatus,setAiStatus]=useState<AiStatus>("idle"),[aiError,setAiError]=useState(""),[aiDraft,setAiDraft]=useState<AiDraft|null>(null);
 useEffect(()=>setItems(photos),[photos]);
 useEffect(()=>{if(libraryOpen||previewIndex!=null)document.body.classList.add("website-photo-library-open");else document.body.classList.remove("website-photo-library-open");return()=>document.body.classList.remove("website-photo-library-open");},[libraryOpen,previewIndex]);
 const photoItems=useMemo(()=>items.map((url,index)=>({url,usage:getUsage(index,items.length),index})),[items]);
 const previewPhoto=previewIndex==null?null:photoItems[previewIndex]??null;
 const visiblePreviewItems=photoItems.slice(0,6);
 const extraCount=Math.max(0,photoItems.length-visiblePreviewItems.length);
 const selectedItems=photoItems.filter(item=>selected.includes(item.url));
 const uploadSummary=uploadStates.length?`${uploadStates.filter(item=>item.status==="done").length} of ${uploadStates.length} uploaded`:"";
 const closePreview=()=>setPreviewIndex(null);
 const businessSlug=typeof window==="undefined"?"":decodeURIComponent(window.location.pathname.split("/")[2]??"");
 const removePhoto=(url:string)=>{setItems(current=>current.filter(item=>item!==url));setSelected(current=>current.filter(item=>item!==url));if(previewIndex!=null&&photoItems[previewIndex]?.url===url)setPreviewIndex(null);};
  async function openAiGenerator(){
   if(disabled||!businessSlug)return;
   setAiOpen(true);setAiError("");
  const result=await openWebsiteAiImageGeneratorSafe(businessSlug,"website_photos");
  if(result.ok===false)setAiError(result.error);
  }
 async function generateAiPhoto(regenerate=false){
  if(disabled||aiStatus==="generating"||aiStatus==="saving"||!businessSlug)return;
  setAiError("");setAiStatus("generating");
  const result=await generateWebsiteAiPhotoSafe(businessSlug,{idempotencyKey:crypto.randomUUID(),section:"website_photos",imageType:aiType,customDescription:aiType==="custom_description"?aiDescription:null,generationKind:regenerate?"regeneration":"initial",replacesGenerationId:regenerate?aiDraft?.generationId??null:null});
  if(!result.ok){
   setAiStatus("idle");
   setAiError(result.error??"We couldn't create that photo. Please try again.");
   return;
  }
  setAiDraft({generationId:result.generationId,imageUrl:result.imageUrl,imageType:aiType});
  setAiStatus("ready");
 }
 async function saveAiPhoto(){
  if(!aiDraft||!businessSlug||items.length>=MAX_UPLOAD_COUNT)return;
  setAiStatus("saving");setAiError("");
  const saved=await saveWebsiteAiPhotoSafe(businessSlug,aiDraft.generationId);
  if(!saved.ok){
   setAiStatus("ready");
   setAiError(saved.error??"That photo could not be saved.");
   return;
  }
  setItems(current=>[...new Set([...current,saved.url])].slice(0,MAX_UPLOAD_COUNT));
  setAiDraft(null);setAiStatus("idle");setAiOpen(false);setAiDescription("");setAiType("hero_banner");
 }
  async function discardAiPhoto(){
   if(!aiDraft||!businessSlug)return setAiOpen(false);
  const result=await discardWebsiteAiPhotoSafe(businessSlug,aiDraft.generationId);
  if(result.ok===false){setAiStatus("ready");setAiError(result.error??"That photo could not be discarded.");return;}
  setAiDraft(null);setAiStatus("idle");setAiError("");setAiDescription("");setAiOpen(false);
  }
 async function upload(event:ChangeEvent<HTMLInputElement>){
  const selectedFiles=Array.from(event.target.files??[]);event.target.value="";setUploadError("");
  if(!selectedFiles.length)return;
  if(selectedFiles.length>MAX_UPLOAD_COUNT){setUploadError("Choose up to 12 photos at a time.");return;}
  if(items.length+selectedFiles.length>MAX_UPLOAD_COUNT){setUploadError(`This website can display 12 photos. You can add ${Math.max(0,MAX_UPLOAD_COUNT-items.length)} more.`);return;}
  if(!businessSlug){setUploadError("The workspace could not be identified. Refresh and try again.");return;}
  setUploading(true);
  setUploadStates(selectedFiles.map(file=>({name:file.name,status:"queued"})));
  try{
   const uploaded:string[]=[];
   for(let index=0;index<selectedFiles.length;index++){
    const original=selectedFiles[index];
    setUploadStates(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,status:"uploading"}:item));
    let file=original;
    const isPhoneFormat=phoneTypes.has(file.type)||phoneName(file.name);
    if(isPhoneFormat){
     if(file.type==="image/gif")throw new Error(`“${file.name}” is ${(file.size/MB).toFixed(1)} MB. Choose a GIF smaller than 8 MB.`);
     file=await jpegFromPhonePhoto(file);
    }
    validateOptimizableImage(file,supportedTypes,MAX_SOURCE_BYTES);
    const optimized=await optimizeImageForUpload(file,{maxSourceBytes:MAX_SOURCE_BYTES,maxDisplayLongEdge:1920,maxThumbLongEdge:560,quality:.78});
    const target=await prepareWebsitePhotoUpload(businessSlug,file.name,file.type,file.size);
    const storage=createSupabaseBrowserClient().storage.from(target.bucket);
    const [displayUpload,thumbUpload]=await Promise.all([
     storage.uploadToSignedUrl(target.display.path,target.display.token,optimized.display,{contentType:optimized.display.type,cacheControl:target.cacheControl}),
     storage.uploadToSignedUrl(target.thumb.path,target.thumb.token,optimized.thumb,{contentType:optimized.thumb.type,cacheControl:target.cacheControl}),
    ]);
    if(displayUpload.error||thumbUpload.error)throw new Error("The photo could not be uploaded. Check your connection and try again.");
    console.info("image_upload_optimized",{source:"website_photos",originalBytes:optimized.originalBytes,displayBytes:optimized.displayBytes,thumbnailBytes:optimized.thumbBytes,compressionRatio:Number(optimized.compressionRatio.toFixed(4)),tenantId:businessSlug});
    uploaded.push(target.display.url);
    setUploadStates(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,status:"done"}:item));
   }
   setItems(current=>[...new Set([...current,...uploaded])].slice(0,MAX_UPLOAD_COUNT));
  }catch(error){
   const message=error instanceof Error?error.message:"The photos could not be uploaded. Please try again.";
   setUploadError(message);
   setUploadStates(current=>current.map(item=>item.status==="done"?item:{...item,status:"error",error:message}));
  }finally{setUploading(false);}
 }
 const selectedCount=selected.length;
 return <div className="website-photo-manager">
  <textarea className="website-photo-values" name="photoUrls" value={items.join("\n")} readOnly aria-hidden="true" tabIndex={-1}/>
  <section className="website-photo-summary">
   <header>
    <button type="button" className="website-photo-summary-heading" onClick={()=>setLibraryOpen(true)}>
     <strong>Website photos · {items.length}</strong>
     <span>Manage photos you&apos;ve uploaded to Servonas.</span>
    </button>
    <button type="button" className="website-photo-manage-link" onClick={()=>setLibraryOpen(true)} disabled={disabled}>Manage photos</button>
   </header>
   {items.length?<div className="website-photo-hero-grid">{visiblePreviewItems.map((photo,index)=><button type="button" className="website-photo-thumb" onClick={()=>{setPreviewIndex(index);setLibraryOpen(true);}} key={photo.url}><img src={storageImageThumbUrl(photo.url)??photo.url} alt={`Website photo ${index+1}`} loading="lazy"/><span>{photo.usage}</span></button>)}{extraCount>0&&<button type="button" className="website-photo-thumb website-photo-thumb-more" onClick={()=>setLibraryOpen(true)}><strong>+{extraCount}</strong><span>More photos</span></button>}</div>:<div className="website-photo-empty"><strong>No website photos yet</strong><span>Upload photos to personalize your website.</span></div>}
   <div className="website-photo-actions">
    <label className="website-photo-upload">Upload photos<small>{uploading?`Uploading ${uploadStates.filter(item=>item.status==="done").length} of ${uploadStates.length} photos...`:"Drag photos here or choose files. Phone photos supported, including HEIC."}</small><input type="file" accept="image/*,.heic,.heif" multiple disabled={disabled||uploading} onChange={event=>void upload(event)}/></label>
    <button type="button" className="website-photo-ai-button" onClick={()=>void openAiGenerator()} disabled={disabled||items.length>=MAX_UPLOAD_COUNT}>Create with AI</button>
    <button type="button" className="text-button" onClick={()=>setLibraryOpen(true)}>Manage photos</button>
   </div>
   {uploadError&&<span className="website-photo-error" role="alert">{uploadError}</span>}
  </section>

  {libraryOpen&&<div className="website-photo-library-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!uploading)setLibraryOpen(false);}}>
   <section className="website-photo-library" role="dialog" aria-modal="true" aria-labelledby="media-library-title">
    <header className="website-photo-library-header">
     <div>
      <strong id="media-library-title">Media Library</strong>
      <span>Manage photos you&apos;ve uploaded to Servonas.</span>
     </div>
     <div className="website-photo-library-header-actions">
      <label className="website-photo-upload compact">Upload photos<small>Pick multiple photos from your phone or desktop.</small><input type="file" accept="image/*,.heic,.heif" multiple disabled={disabled||uploading} onChange={event=>void upload(event)}/></label>
      <button type="button" className="website-photo-ai-button compact" onClick={()=>void openAiGenerator()} disabled={disabled||items.length>=MAX_UPLOAD_COUNT}>Create with AI</button>
      <button type="button" className="text-button" onClick={()=>setSelected(current=>current.length===photoItems.length?[]:photoItems.map(item=>item.url))} disabled={!photoItems.length}>Select all</button>
      <button type="button" className="text-button danger" onClick={()=>{if(selectedItems.length)setPendingRemove(selectedItems[0]);}} disabled={!selectedItems.length}>Delete</button>
      <button type="button" className="website-photo-close" onClick={()=>setLibraryOpen(false)} aria-label="Close media library">×</button>
     </div>
    </header>
    {uploading&&<p className="website-photo-progress" role="status">{uploadSummary}</p>}
    {selectedCount>0&&<div className="website-photo-selection-bar"><strong>{selectedCount} selected</strong><span>{selectedItems.some(item=>item.usage)?`One or more selected photos are already in use on your website.`:"Selected photos are not used on your website yet."}</span><div><button type="button" className="sv-button sv-secondary" onClick={()=>setSelected([])}>Clear</button><button type="button" className="sv-button sv-danger" onClick={()=>setPendingRemove(selectedItems[0]??null)} disabled={!selectedItems.length}>Delete</button></div></div>}
    <div className="website-photo-grid">{photoItems.length?photoItems.map((photo,index)=><button type="button" className={`website-photo-grid-item${selected.includes(photo.url)?" selected":""}`} key={photo.url} onClick={()=>setPreviewIndex(index)} onKeyDown={event=>{if(event.key===" "||event.key==="Enter"){event.preventDefault();setPreviewIndex(index);}}}>
      <span className="website-photo-check" onClick={event=>{event.stopPropagation();setSelected(current=>current.includes(photo.url)?current.filter(item=>item!==photo.url):[...current,photo.url]);}} aria-label={selected.includes(photo.url)?`Deselect photo ${index+1}`:`Select photo ${index+1}`}>{selected.includes(photo.url)?"✓":""}</span>
      <img src={storageImageThumbUrl(photo.url)??photo.url} alt={`Website photo ${index+1}`} loading="lazy"/>
      <span className="website-photo-grid-meta"><strong>{photo.usage||"PHOTO"}</strong><small>Photo {index+1}</small></span>
     </button>):<div className="website-photo-empty large"><strong>No photos in your library yet</strong><span>Upload photos to start building your media library.</span></div>}</div>
   </section>
  </div>}

  {previewPhoto&&<div className="website-photo-library-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)closePreview();}}>
   <section className="website-photo-preview" role="dialog" aria-modal="true" aria-labelledby="photo-preview-title">
    <header>
     <div>
      <strong id="photo-preview-title">Photo preview</strong>
      <span>{previewPhoto.usage?`Used as ${previewPhoto.usage}`:"Not currently used"}</span>
     </div>
     <button type="button" className="website-photo-close" onClick={closePreview} aria-label="Close preview">×</button>
    </header>
    <div className="website-photo-preview-image"><img src={previewPhoto.url} alt={`Website photo ${previewPhoto.index+1}`}/></div>
    <div className="website-photo-preview-meta"><strong>Photo {previewPhoto.index+1}</strong><span>Filename, upload date, and dimensions can be added once those fields are modeled centrally.</span>{previewPhoto.usage&&<b className="website-photo-usage-badge">{previewPhoto.usage}</b>}</div>
    <div className="website-photo-preview-actions">
     <button type="button" className="sv-button sv-secondary" onClick={()=>setPreviewIndex(index=>index==null?null:Math.max(0,index-1))} disabled={previewIndex===0}>Previous</button>
     <button type="button" className="sv-button sv-secondary" onClick={()=>setSelected(current=>current.includes(previewPhoto.url)?current.filter(item=>item!==previewPhoto.url):[...current,previewPhoto.url])}>{selected.includes(previewPhoto.url)?"Deselect":"Select"}</button>
     <button type="button" className="sv-button sv-secondary" onClick={()=>setPreviewIndex(index=>index==null?null:Math.min(photoItems.length-1,index+1))} disabled={previewIndex===photoItems.length-1}>Next</button>
     <button type="button" className="sv-button sv-danger" onClick={()=>setPendingRemove(previewPhoto)} disabled={disabled}>Delete</button>
    </div>
   </section>
  </div>}

  {pendingRemove&&<div className="website-photo-library-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPendingRemove(null);}}>
   <section role="dialog" aria-modal="true" aria-labelledby="remove-website-photo-title" className="website-photo-confirm">
    <h3 id="remove-website-photo-title">Delete this photo?</h3>
    <p>{pendingRemove.usage?`This photo is currently being used as your website ${pendingRemove.usage.toLowerCase()} image. Deleting it may remove it from your published website.`:"This photo is not currently being used on your website."}</p>
    <img src={storageImageThumbUrl(pendingRemove.url)??pendingRemove.url} alt={`Photo ${pendingRemove.index+1} selected for deletion`} loading="lazy"/>
    <div>
     <button type="button" className="sv-button sv-secondary" onClick={()=>setPendingRemove(null)}>Keep photo</button>
     <button type="button" className="sv-button sv-danger" onClick={()=>removePhoto(pendingRemove.url)}>Delete photo</button>
    </div>
   </section>
  </div>}

  {aiOpen&&<div className="website-photo-library-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&aiStatus!=="generating"&&aiStatus!=="saving")setAiOpen(false);}}>
   <section className="website-ai-modal" role="dialog" aria-modal="true" aria-labelledby="website-ai-title">
    <header>
     <div>
      <strong id="website-ai-title">Create a photo for your website</strong>
      <span>Generate a professional service-business image without leaving Servonas.</span>
     </div>
     <button type="button" className="website-photo-close" onClick={()=>setAiOpen(false)} aria-label="Close AI photo generator">×</button>
    </header>
    {!aiDraft&&<div className="website-ai-panel">
     <div className="website-ai-type-grid">{websiteAiImageTypes.map(type=><button type="button" key={type} className={`website-ai-type${aiType===type?" selected":""}`} onClick={()=>setAiType(type)}>{imageTypeLabels[type]}</button>)}</div>
     {aiType==="custom_description"&&<label className="website-ai-description">Describe the photo<textarea rows={4} maxLength={400} value={aiDescription} onChange={event=>setAiDescription(event.target.value)} placeholder="Example: A clean service van parked outside a modern home at golden hour with a technician greeting the homeowner."/></label>}
     <div className="website-ai-actions">
      <button type="button" className="sv-button" disabled={aiStatus==="generating"||aiType==="custom_description"&&!aiDescription.trim()} onClick={()=>void generateAiPhoto(false)}>{aiStatus==="generating"?"Generating...":"Generate Photo"}</button>
      <button type="button" className="sv-button sv-secondary" onClick={()=>setAiOpen(false)} disabled={aiStatus==="generating"}>Cancel</button>
     </div>
    </div>}
    {aiDraft&&<div className="website-ai-preview">
     <div className="website-ai-preview-image"><img src={aiDraft.imageUrl} alt={imageTypeLabels[aiDraft.imageType]}/></div>
     <div className="website-ai-actions">
      <button type="button" className="sv-button" onClick={()=>void saveAiPhoto()} disabled={aiStatus==="saving"||items.length>=MAX_UPLOAD_COUNT}>{aiStatus==="saving"?"Saving...":"Use this photo"}</button>
      <button type="button" className="sv-button sv-secondary" onClick={()=>void generateAiPhoto(true)} disabled={aiStatus==="saving"||aiStatus==="generating"}>Regenerate</button>
      <button type="button" className="text-button danger" onClick={()=>void discardAiPhoto()} disabled={aiStatus==="saving"||aiStatus==="generating"}>Discard</button>
     </div>
    </div>}
    {aiError&&<p className="website-photo-error" role="alert">{aiError}</p>}
   </section>
  </div>}
 </div>;
}
