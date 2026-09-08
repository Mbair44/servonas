"use client";

import {useState} from "react";
import {useFormStatus} from "react-dom";

type Section={heading:string;body:string};
type Faq={question:string;answer:string};
type Page={page_title:string;meta_description:string;og_title:string;og_description:string;h1:string;hero_copy:string;cta_label:string;slug:string;sections:Section[];faqs:Faq[]};
const SaveButton=()=>{const {pending}=useFormStatus();return <button className="sv-button" disabled={pending}>{pending?"Saving…":"Save changes"}</button>;};

export function LocationPageEditor({page,saveAction}:{page:Page;saveAction:(formData:FormData)=>void}){
 const [sections,setSections]=useState<Section[]>(page.sections??[]),[faqs,setFaqs]=useState<Faq[]>(page.faqs??[]);
 return <form action={saveAction} className="location-page-editor-form">
  <section className="location-page-copy-fields">
   <label>Page headline<input name="h1" required maxLength={120} defaultValue={page.h1}/></label>
   <label>Introduction<textarea name="heroCopy" required maxLength={500} rows={4} defaultValue={page.hero_copy}/></label>
   <label>Button text<input name="ctaLabel" required maxLength={40} defaultValue={page.cta_label}/></label>
   <div className="location-page-edit-list"><h3>Page sections</h3>{sections.map((section,index)=><article key={index}><input aria-label={`Section ${index+1} heading`} value={section.heading} onChange={event=>setSections(items=>items.map((item,itemIndex)=>itemIndex===index?{...item,heading:event.target.value}:item))}/><textarea aria-label={`Section ${index+1} content`} rows={5} value={section.body} onChange={event=>setSections(items=>items.map((item,itemIndex)=>itemIndex===index?{...item,body:event.target.value}:item))}/></article>)}</div>
   <div className="location-page-edit-list"><h3>Customer questions</h3>{faqs.map((faq,index)=><article key={index}><input aria-label={`Question ${index+1}`} value={faq.question} onChange={event=>setFaqs(items=>items.map((item,itemIndex)=>itemIndex===index?{...item,question:event.target.value}:item))}/><textarea aria-label={`Answer ${index+1}`} rows={3} value={faq.answer} onChange={event=>setFaqs(items=>items.map((item,itemIndex)=>itemIndex===index?{...item,answer:event.target.value}:item))}/></article>)}</div>
   <input type="hidden" name="sections" value={JSON.stringify(sections)}/><input type="hidden" name="faqs" value={JSON.stringify(faqs)}/>
   <details className="location-page-seo-details"><summary>SEO details</summary><p>Servonas created these automatically. You can adjust them if needed.</p><label>Page URL<input name="pageSlug" required maxLength={80} defaultValue={page.slug}/></label><label>Search result title<input name="pageTitle" required maxLength={65} defaultValue={page.page_title}/></label><label>Search result description<textarea name="metaDescription" required maxLength={160} rows={3} defaultValue={page.meta_description}/></label><label>Social sharing title<input name="ogTitle" required maxLength={80} defaultValue={page.og_title}/></label><label>Social sharing description<textarea name="ogDescription" required maxLength={200} rows={3} defaultValue={page.og_description}/></label></details>
   <SaveButton/>
  </section>
  <aside className="location-page-editor-preview"><span>Customer preview</span><div><small>Local service</small><h2>{page.h1}</h2><p>{page.hero_copy}</p><b>{page.cta_label}</b></div></aside>
 </form>;
}
