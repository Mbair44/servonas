"use client";

import {useState} from "react";

export function WebsitePhotoManager({photos=[],disabled=false}:{photos?:string[];disabled?:boolean}){
 const [items,setItems]=useState(photos),[pending,setPending]=useState<{url:string;index:number}|null>(null);
 const remove=()=>{if(!pending)return;setItems(current=>current.filter(url=>url!==pending.url));setPending(null);};
 return <div className="website-photo-manager">
  <textarea className="website-photo-values" name="photoUrls" value={items.join("\n")} readOnly aria-hidden="true" tabIndex={-1}/>
  {items.length?<div className="website-photo-previews">{items.map((url,index)=><figure key={url}><img src={url} alt={`Website photo ${index+1}`}/>{!disabled&&<button type="button" className="website-photo-delete" onClick={()=>setPending({url,index})} aria-label={`Remove website photo ${index+1}`} title="Remove photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button>}<figcaption>{index===0?"Hero photo":index===1?"About photo":`Gallery photo ${index-1}`}</figcaption></figure>)}</div>:<div className="website-photo-empty"><strong>No website photos yet</strong><span>Upload photos to personalize your website.</span></div>}
  <label className="website-photo-upload">Upload photos <small>JPG, PNG, WebP, GIF, or AVIF. Up to 6 at a time and 8 MB each.</small><input name="websitePhotos" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple disabled={disabled}/></label>
  <small>The first photo is used in the hero, the second appears in About, and the remaining photos build the gallery.</small>
  {pending&&<div className="website-photo-confirm-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPending(null);}}><section role="dialog" aria-modal="true" aria-labelledby="remove-website-photo-title"><div className="website-photo-confirm-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg></div><h3 id="remove-website-photo-title">Remove this photo?</h3><p>It will stop appearing on the website after you select <strong>Save &amp; Continue</strong>.</p><img src={pending.url} alt={`Photo ${pending.index+1} selected for removal`}/><div><button type="button" className="sv-button sv-secondary" onClick={()=>setPending(null)}>Keep photo</button><button type="button" className="sv-button sv-danger" onClick={remove}>Remove photo</button></div></section></div>}
 </div>;
}
