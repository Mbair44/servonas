"use server";

import {createHash} from "node:crypto";
import {headers} from "next/headers";
import type {WebsiteRequestState} from "@/components/WebsiteRequestForm";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {normalizeWebsitePhone,websiteRequestErrors} from "@/lib/website";

const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();

export async function submitWebsiteRequest(siteSlug:string,_state:WebsiteRequestState,data:FormData):Promise<WebsiteRequestState>{
 const values=Object.fromEntries([...data.entries()].filter(([key,value])=>typeof value==="string"&&key!=="companyWebsite").map(([key,value])=>[key,String(value)]));
 const fail=(error:string,fieldErrors:Record<string,string>={}):WebsiteRequestState=>({error,fieldErrors,values});
 if(text(data,"companyWebsite"))return {success:"Thank you. The business will follow up shortly."};
 const db=getSupabaseAdmin();if(!db)return fail("Online requests are temporarily unavailable. Please call the business directly.");
 const {data:website}=await db.from("business_website_settings").select("id,business_id,request_service_enabled").ilike("public_slug",siteSlug).eq("status","published").maybeSingle();
 if(!website||!website.request_service_enabled)return fail("This website is not currently accepting online requests.");
 const name=text(data,"name"),phone=normalizeWebsitePhone(text(data,"phone")),email=text(data,"email").toLowerCase(),address=text(data,"address"),description=text(data,"description"),preferredAt=text(data,"preferredAt"),serviceValue=text(data,"serviceId"),requestKey=text(data,"requestKey");
 const fieldErrors=websiteRequestErrors({name,phone,email,address,description,requestKey});
 let serviceId:string|null=null;
 if(serviceValue&&serviceValue!=="other"){
  const {data:service}=await db.from("services").select("id").eq("business_id",website.business_id).eq("id",serviceValue).eq("active",true).eq("is_deleted",false).maybeSingle();
  if(!service)fieldErrors.serviceId="Choose an available service.";else serviceId=service.id;
 }
 if(!serviceValue)fieldErrors.serviceId="Choose a service.";
 if(Object.keys(fieldErrors).length)return fail("Please correct the highlighted information.",fieldErrors);
 const requestHeaders=await headers(),ip=requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()||requestHeaders.get("x-real-ip")||"unknown";
 const ipHash=createHash("sha256").update(`${process.env.WEBSITE_REQUEST_HASH_SALT??"servonas-website"}:${ip}`).digest("hex");
 const oneHourAgo=new Date(Date.now()-60*60*1000).toISOString();
 const {count}=await db.from("website_service_requests").select("id",{count:"exact",head:true}).eq("business_id",website.business_id).eq("submitted_ip_hash",ipHash).gte("created_at",oneHourAgo);
 if((count??0)>=5)return fail("Too many requests were submitted recently. Please call the business directly.");
 const {data:prior}=await db.from("website_service_requests").select("id").eq("business_id",website.business_id).eq("request_key",requestKey).maybeSingle();
 if(prior)return {success:"Your request was already received. The business will follow up shortly."};
 let customer:null|{id:string;email:string|null;phone:string|null}=null;
 if(email){const {data:match}=await db.from("customers").select("id,email,phone").eq("business_id",website.business_id).eq("is_deleted",false).ilike("email",email).limit(1).maybeSingle();customer=match;}
 if(!customer&&phone){const {data:match}=await db.from("customers").select("id,email,phone").eq("business_id",website.business_id).eq("is_deleted",false).in("phone",[phone,text(data,"phone")]).limit(1).maybeSingle();customer=match;}
 const parts=name.split(/\s+/),firstName=parts.shift()||name,lastName=parts.join(" ");
 if(!customer){
  const {data:created,error}=await db.from("customers").insert({business_id:website.business_id,first_name:firstName,last_name:lastName,email:email||null,phone,preferred_contact_method:email?"email":"phone",lead_source:"website"}).select("id,email,phone").single();
  if(error||!created){
   if(error?.code==="23505"){
    const {data:match}=await db.from("customers").select("id,email,phone").eq("business_id",website.business_id).eq("is_deleted",false).or(email?`email.ilike.${email},phone.eq.${phone}`:`phone.eq.${phone}`).limit(1).maybeSingle();
    if(match){customer=match;}
    else{console.error("Website customer conflict could not be resolved",{businessId:website.business_id,code:error.code,emailProvided:Boolean(email),phoneProvided:Boolean(phone)});return fail("Your request could not be saved. Please call the business directly.");}
   }else{
    console.error("Website customer creation failed",{businessId:website.business_id,code:error?.code});
    return fail("Your request could not be saved. Please call the business directly.");
   }
  }else customer=created;
 }else{
  const {error}=await db.from("customers").update({first_name:firstName,last_name:lastName||undefined,email:email||customer.email,phone:phone||customer.phone,updated_at:new Date().toISOString()}).eq("business_id",website.business_id).eq("id",customer.id);
  if(error)console.warn("Website customer refresh failed",{businessId:website.business_id,customerId:customer.id,code:error.code});
 }
 const {error}=await db.from("website_service_requests").insert({business_id:website.business_id,website_id:website.id,customer_id:customer.id,service_id:serviceId,request_key:requestKey,customer_name:name,phone,email:email||null,service_address:address,description,preferred_at:preferredAt||null,submitted_ip_hash:ipHash});
 if(error){if(error.code==="23505")return {success:"Your request was already received. The business will follow up shortly."};console.error("Website request creation failed",{businessId:website.business_id,code:error.code});return fail("Your request could not be saved. Please call the business directly.");}
 return {success:"The business received your request and will follow up using the contact information you provided."};
}
