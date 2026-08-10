"use client";

import {useState} from "react";

function validReviewUrl(value:string){
 try{const url=new URL(value);return url.protocol==="https:"?url.toString():null;}catch{return null;}
}

export function GoogleReviewPageField({defaultValue="",disabled=false}:{defaultValue?:string;disabled?:boolean}){
 const [value,setValue]=useState(defaultValue),url=validReviewUrl(value);
 return <label className="website-google-review-url">Google Business review page<div className="website-social-input"><input name="googleReviewUrl" type="url" placeholder="https://g.page/r/.../review" value={value} onChange={event=>setValue(event.target.value)} disabled={disabled}/><button className="sv-button sv-secondary" type="button" disabled={!url} onClick={()=>url&&window.open(url,"_blank","noopener,noreferrer")}>Test Google Review Page</button></div><small>{value&&!url?"Enter a secure HTTPS Google review link.":"This link brings visitors to your review page on Google."}</small></label>;
}
