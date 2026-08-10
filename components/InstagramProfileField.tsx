"use client";

import {useState} from "react";
import {normalizeInstagramUrl} from "@/lib/socialLinks";

export function InstagramProfileField({defaultValue="",disabled=false,showLabel=true}:{defaultValue?:string;disabled?:boolean;showLabel?:boolean}){
 const [value,setValue]=useState(defaultValue),url=normalizeInstagramUrl(value);
 return <label>{showLabel&&<span>Instagram profile</span>}<div className="website-social-input"><input name="instagramUrl" aria-label="Instagram profile" placeholder="@yourbusiness or instagram.com/yourbusiness" value={value} onChange={event=>setValue(event.target.value)} disabled={disabled}/><button className="sv-button sv-secondary" type="button" disabled={!url} onClick={()=>url&&window.open(url,"_blank","noopener,noreferrer")}>Test Instagram</button></div><small>{value&&!url?"Enter a valid Instagram username or public profile link.":"Test the profile before saving the website."}</small></label>;
}
