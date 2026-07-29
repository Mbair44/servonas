"use client";

import {useEffect} from "react";
import {formatPhoneInput} from "@/lib/phoneFormatting";

const PHONE_SELECTOR='input[type="tel"],input[autocomplete="tel"],input[name*="phone" i]';

export function PhoneInputFormatter(){
 useEffect(()=>{
  const format=(event:Event)=>{
   const input=event.target;
   if(!(input instanceof HTMLInputElement)||!input.matches(PHONE_SELECTOR))return;
   const before=input.value,cursor=input.selectionStart??before.length;
   const digitsBefore=before.slice(0,cursor).replace(/\D/g,"").length;
   const formatted=formatPhoneInput(before);
   if(formatted===before)return;
   input.value=formatted;
   let nextCursor=formatted.length,seen=0;
   for(let index=0;index<formatted.length;index++){
    if(/\d/.test(formatted[index]))seen++;
    if(seen>=digitsBefore){nextCursor=index+1;break;}
   }
   input.setSelectionRange(nextCursor,nextCursor);
  };
  document.addEventListener("input",format);
  document.addEventListener("blur",format,true);
  return ()=>{document.removeEventListener("input",format);document.removeEventListener("blur",format,true);};
 },[]);
 return null;
}
