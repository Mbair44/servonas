"use client";

import {useState} from "react";

export type WebsiteGoogleReview={author:string;rating:number;text:string};

export function GoogleReviewsEditor({reviews,disabled=false}:{reviews:WebsiteGoogleReview[];disabled?:boolean}){
 const [items,setItems]=useState(reviews);
 const add=()=>setItems(current=>current.length>=6?current:[...current,{author:"",rating:5,text:""}]);
 const remove=(index:number)=>setItems(current=>current.filter((_,itemIndex)=>itemIndex!==index));
 return <div className="google-reviews-editor">
  <div className="google-reviews-heading"><div><strong>Featured Google reviews</strong><small>Add up to six reviews you have permission to publish.</small></div>{!disabled&&<button type="button" className="sv-button sv-secondary" onClick={add} disabled={items.length>=6}>＋ Add review</button>}</div>
  {items.length?<div className="google-review-edit-list">{items.map((review,index)=><article key={index}>
   <label>Customer name<input required name="reviewAuthor" maxLength={100} defaultValue={review.author} disabled={disabled}/></label>
   <label>Rating<select name="reviewRating" defaultValue={review.rating} disabled={disabled}>{[5,4,3,2,1].map(value=><option value={value} key={value}>{value} star{value===1?"":"s"}</option>)}</select></label>
   <label className="wide">Review<textarea required name="reviewText" maxLength={600} rows={3} defaultValue={review.text} disabled={disabled}/></label>
   {!disabled&&<button type="button" className="google-review-remove" onClick={()=>remove(index)} aria-label={`Remove review from ${review.author||`customer ${index+1}`}`}>Remove</button>}
  </article>)}</div>:<div className="google-reviews-empty"><strong>No featured reviews yet</strong><span>Add customer reviews to build trust on the public website.</span></div>}
 </div>;
}
