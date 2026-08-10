"use client";

import {useState,type ChangeEvent} from "react";

const MB=1024*1024;

function validate(event:ChangeEvent<HTMLInputElement>,limitMb:number,types:Set<string>,setError:(value:string)=>void){
 const file=event.target.files?.[0];
 if(!file){setError("");return;}
 if(!types.has(file.type)){setError(`“${file.name}” is not a supported file type.`);event.target.value="";return;}
 if(file.size>limitMb*MB){setError(`“${file.name}” is ${(file.size/MB).toFixed(1)} MB. Choose a file ${limitMb} MB or smaller.`);event.target.value="";return;}
 setError("");
}

export function RentalInventoryFileFields({receiptUrl,receiptName}:{receiptUrl?:string;receiptName?:string|null}){
 const [imageError,setImageError]=useState(""),[receiptError,setReceiptError]=useState("");
 return <>
  <label>Rental image<input name="image" type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>validate(event,8,new Set(["image/jpeg","image/png","image/webp"]),setImageError)}/><small>JPG, PNG, or WebP. Maximum file size: 8 MB.</small>{imageError&&<span className="rental-file-error" role="alert">{imageError}</span>}</label>
  <label className="wide rental-receipt-field">Purchase receipt<input name="purchaseReceipt" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={event=>validate(event,10,new Set(["application/pdf","image/jpeg","image/png","image/webp"]),setReceiptError)}/><small>PDF, JPG, PNG, or WebP. Maximum file size: 10 MB. Stored privately.</small>{receiptError&&<span className="rental-file-error" role="alert">{receiptError}</span>}{receiptUrl&&<span><a href={receiptUrl} target="_blank" rel="noreferrer">View current receipt{receiptName?` · ${receiptName}`:""}</a><span className="rental-remove-receipt"><input type="checkbox" name="removePurchaseReceipt"/> Remove current receipt</span></span>}</label>
 </>;
}
