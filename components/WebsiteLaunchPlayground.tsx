"use client";

import {useMemo, useState} from "react";

const templates=[
 ["modern","Modern"],
 ["bold","Bold"],
 ["traditional","Traditional"],
] as const;

const palettes=[
 {name:"Ocean",primary:"#1769f5",secondary:"#0b1733"},
 {name:"Forest",primary:"#166534",secondary:"#163020"},
 {name:"Sunset",primary:"#ea580c",secondary:"#7c2d12"},
 {name:"Slate",primary:"#334155",secondary:"#0f172a"},
] as const;

type Props={
 businessSlug:string;
 initialTemplate:string;
 initialPrimary:string;
 initialSecondary:string;
 initialHeading:string;
 initialSubheading:string;
};

export function WebsiteLaunchPlayground({businessSlug,initialTemplate,initialPrimary,initialSecondary,initialHeading,initialSubheading}:Props){
 const [template,setTemplate]=useState(initialTemplate||"modern");
 const [primary,setPrimary]=useState(initialPrimary||"#1769f5");
 const [secondary,setSecondary]=useState(initialSecondary||"#0b1733");
 const [heading,setHeading]=useState(initialHeading||"");
 const [subheading,setSubheading]=useState(initialSubheading||"");
 const iframeSrc=useMemo(()=>{
  const query=new URLSearchParams({template,primaryColor:primary,secondaryColor:secondary});
  if(heading.trim())query.set("heroHeading",heading.trim());
  if(subheading.trim())query.set("heroSubheading",subheading.trim());
  return `/app/${businessSlug}/settings/website/preview?${query.toString()}`;
 },[businessSlug,heading,primary,secondary,subheading,template]);

 return <section className="website-launch-playground">
  <div className="website-launch-controls">
   <header>
    <span>Now make it yours</span>
    <h2>Your website is live. Make it yours.</h2>
    <p>Click around your website, try different looks, or leave it exactly as it is. You can change anything later.</p>
   </header>
   <div className="website-launch-control-group">
    <strong>Try a different look</strong>
    <div className="website-launch-template-options">{templates.map(([value,label])=><button type="button" key={value} className={template===value?"active":""} onClick={()=>setTemplate(value)}>{label}</button>)}</div>
   </div>
   <div className="website-launch-control-group">
    <strong>Quick color palettes</strong>
    <div className="website-launch-palette-options">{palettes.map(palette=><button type="button" key={palette.name} className={primary===palette.primary&&secondary===palette.secondary?"active":""} onClick={()=>{setPrimary(palette.primary);setSecondary(palette.secondary);}}><i style={{background:palette.primary}}/><i style={{background:palette.secondary}}/><span>{palette.name}</span></button>)}</div>
   </div>
   <div className="website-launch-color-grid">
    <label>Primary color<input type="color" value={primary} onChange={event=>setPrimary(event.target.value)}/></label>
    <label>Accent color<input type="color" value={secondary} onChange={event=>setSecondary(event.target.value)}/></label>
   </div>
   <div className="website-launch-copy-grid">
    <label>Headline<input value={heading} onChange={event=>setHeading(event.target.value)} maxLength={180}/></label>
    <label>Tagline<textarea value={subheading} onChange={event=>setSubheading(event.target.value)} rows={3} maxLength={500}/></label>
   </div>
  </div>
  <div className="website-launch-frame">
   <iframe src={iframeSrc} title="Live website playground preview"/>
  </div>
 </section>;
}
