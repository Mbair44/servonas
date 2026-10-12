"use client";
import {useActionState,useState} from "react";
import type {PromotionDetails} from "@/lib/promotionEditing";
import {editPromotion} from "./actions";
export function PromotionEditor({businessSlug,promotion}:{businessSlug:string;promotion:PromotionDetails&{id:string}}){
 const [draft,setDraft]=useState(promotion);
 const [state,action,pending]=useActionState(editPromotion.bind(null,businessSlug,promotion.id),{error:"",success:""});
 return <details className="discount-editor"><summary>Edit promotion</summary><form action={action}>
  <div aria-live="polite">{state.error&&<p role="alert" className="workspace-notice error">{state.error}</p>}{state.success&&<p className="workspace-notice success">{state.success}</p>}</div>
  <fieldset disabled={pending} style={{border:0,padding:0,margin:0}}><div className="discount-form-grid">
   <label className="wide">Promotion name<input name="name" required maxLength={160} value={draft.name} onChange={event=>setDraft(current=>({...current,name:event.target.value}))}/></label>
   <label className="wide">Page URL ending<input name="slug" required minLength={2} maxLength={80} pattern="[a-z0-9-]{2,80}" value={draft.slug} onChange={event=>setDraft(current=>({...current,slug:event.target.value}))}/><small>Changing this changes the promotion link. Update any ads or shared links using the old URL.</small></label>
   <label className="wide">Headline<input name="headline" required maxLength={240} value={draft.headline} onChange={event=>setDraft(current=>({...current,headline:event.target.value}))}/></label>
   <label className="wide">Short explanation<textarea name="subheadline" rows={3} maxLength={2000} value={draft.subheadline??""} onChange={event=>setDraft(current=>({...current,subheadline:event.target.value}))}/></label>
   <label className="wide">Button text<input name="cta_text" required maxLength={100} value={draft.cta_text} onChange={event=>setDraft(current=>({...current,cta_text:event.target.value}))}/></label>
   <label className="wide">Offer details<textarea name="terms" rows={4} maxLength={10000} value={draft.terms??""} onChange={event=>setDraft(current=>({...current,terms:event.target.value}))}/></label>
  </div><p>Use “Edit discount and tiers” below to change the offer amount or booking limit. Eligible categories are saved separately.</p>
  <button className="sv-button" disabled={pending}>{pending?"Saving…":"Save promotion"}</button></fieldset>
 </form></details>;
}
