"use client";

import {useState} from "react";
import {normalizeInstagramUrl} from "@/lib/socialLinks";

export function InstagramProfileField({defaultValue="",disabled=false}:{defaultValue?:string;disabled?:boolean}){
 const [value,setValue]=useState(defaultValue),url=normalizeInstagramUrl(value);
 return <label>Instagram profile<div className="website-social-input"><input name="instagramUrl" placeholder="@yourbusiness or instagram.com/yourbusiness" value={value} onChange={event=>setValue(event.target.value)} disabled={disabled}/><button className="sv-button sv-secondary" type="button" disabled={!url} onClick={()=>url&&window.open(url,"_blank","noopener,noreferrer")}>Test Instagram</button></div><small>{value&&!url?"Enter a valid Instagram username or public profile link.":"Test the profile before saving the website."}</small></label>;
}
