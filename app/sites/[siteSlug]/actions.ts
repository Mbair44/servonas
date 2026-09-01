"use server";

import {createHash} from "node:crypto";
import {headers} from "next/headers";
import type {WebsiteRequestState} from "@/components/WebsiteRequestForm";
import {sendWebsiteRequestBusinessNotification} from "@/lib/communications/websiteRequestEmailService";
import {sendWebsiteLeadCaptureEmail} from "@/lib/communications/websiteLeadCaptureEmailService";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {normalizeWebsitePhone,websiteRequestErrors} from "@/lib/website";

const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const popupState=(error?:string,success?:boolean,_couponCode?:string|null,successMessage?:string)=>({error,success,successMessage});
const offerLabel=(popup:{discountType:string|null;discountValue:number|null;customOffer:string|null})=>{
 if(popup.discountType==="percentage"&&popup.discountValue!=null)return `${popup.discountValue/100}% off`;
 if(popup.discountType==="fixed"&&popup.discountValue!=null)return `$${(popup.discountValue/100).toFixed(0)} off`;
 return popup.customOffer||"Special offer";
};

async function ensurePopupDiscount(db:any,input:{businessId:string;userId:string|null;businessName:string;popup:any}){
 const couponCode=String(input.popup.lead_capture_popup_coupon_code??"").trim().toUpperCase();
 if(!couponCode||!["fixed","percentage"].includes(String(input.popup.lead_capture_popup_discount_type??"")))return {discountId:null,couponCode:couponCode||null};
 const payload={
  business_id:input.businessId,
  name:`${input.businessName} Website Popup`,
  code:couponCode,
  discount_type:input.popup.lead_capture_popup_discount_type,
  discount_value:Number(input.popup.lead_capture_popup_discount_value),
  applies_to:input.popup.lead_capture_popup_service_id||input.popup.lead_capture_popup_inventory_item_id?"selected_items":"order",
  application_method:"code",
  minimum_subtotal_cents:input.popup.lead_capture_popup_minimum_subtotal_cents??null,
  expires_at:input.popup.lead_capture_popup_expires_at??null,
  first_time_customer_only:true,
  is_active:true,
  updated_by:input.userId,
  created_by:input.userId,
 };
 const {data:discount,error}=await db.from("discounts").upsert(payload,{onConflict:"business_id,normalized_code"}).select("id").single();
 if(error)console.error("Website popup discount sync failed",{businessId:input.businessId,code:error.code,message:error.message});
 if(discount?.id){
  await db.from("discount_items").delete().eq("business_id",input.businessId).eq("discount_id",discount.id);
  if(input.popup.lead_capture_popup_service_id||input.popup.lead_capture_popup_inventory_item_id){
   await db.from("discount_items").insert([{
    business_id:input.businessId,
    discount_id:discount.id,
    service_id:input.popup.lead_capture_popup_service_id??null,
    inventory_item_id:input.popup.lead_capture_popup_inventory_item_id??null,
   }]);
  }
 }
 return {discountId:discount?.id??null,couponCode:couponCode||null};
}

export async function submitWebsiteRequest(siteSlug:string,_state:WebsiteRequestState,data:FormData):Promise<WebsiteRequestState>{
 const values=Object.fromEntries([...data.entries()].filter(([key,value])=>typeof value==="string"&&key!=="companyWebsite").map(([key,value])=>[key,String(value)]));
 const fail=(error:string,fieldErrors:Record<string,string>={}):WebsiteRequestState=>({error,fieldErrors,values});
 if(text(data,"companyWebsite"))return {success:"Thank you. The business will follow up shortly."};
 const db=getSupabaseAdmin();if(!db)return fail("Online requests are temporarily unavailable. Please call the business directly.");
 const {data:website}=await db.from("business_website_settings").select("id,business_id,request_service_enabled,businesses(name,email,owner_user_id)").ilike("public_slug",siteSlug).eq("status","published").maybeSingle();
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
 const {data:request,error}=await db.from("website_service_requests").insert({business_id:website.business_id,website_id:website.id,customer_id:customer.id,service_id:serviceId,request_key:requestKey,customer_name:name,phone,email:email||null,service_address:address,description,preferred_at:preferredAt||null,submitted_ip_hash:ipHash}).select("id").single();
 if(error||!request){if(error?.code==="23505")return {success:"Your request was already received. The business will follow up shortly."};console.error("Website request creation failed",{businessId:website.business_id,code:error?.code});return fail("Your request could not be saved. Please call the business directly.");}
 const business=Array.isArray(website.businesses)?website.businesses[0]:website.businesses;
 const {data:ownerProfile}=business?.owner_user_id?await db.from("profiles").select("email").eq("id",business.owner_user_id).maybeSingle():{data:null};
 const recipient=business?.email?.trim()||ownerProfile?.email?.trim();
 if(!recipient){
  console.error("Website consultation notification email failed",{businessId:website.business_id,requestId:request.id,provider:"resend",reason:"recipient_not_configured"});
 }else{
  const serviceName=serviceId?(await db.from("services").select("name").eq("business_id",website.business_id).eq("id",serviceId).maybeSingle()).data?.name:null;
  await sendWebsiteRequestBusinessNotification({businessId:website.business_id,requestId:request.id,businessName:business?.name||"Service business",recipient,customerName:name,customerPhone:phone,customerEmail:email||null,serviceName,serviceAddress:address,description,preferredAt:preferredAt||null});
 }
 return {success:"The business received your request and will follow up using the contact information you provided."};
}

export async function submitWebsiteLeadCapture(siteSlug:string,_state:{success?:boolean;error?:string;couponCode?:string;successMessage?:string},data:FormData){
 if(text(data,"companyWebsite"))return popupState(undefined,true);
 const email=text(data,"email").toLowerCase();
 if(!emailPattern.test(email))return popupState("Enter a valid email address.");
 const db=getSupabaseAdmin();if(!db)return popupState("This offer is temporarily unavailable.");
 const {data:website}=await db.from("business_website_settings").select("id,business_id,public_slug,lead_capture_popup_enabled,lead_capture_popup_headline,lead_capture_popup_body,lead_capture_popup_discount_type,lead_capture_popup_discount_value,lead_capture_popup_custom_offer,lead_capture_popup_coupon_code,lead_capture_popup_cta_text,lead_capture_popup_delay_seconds,lead_capture_popup_expires_at,lead_capture_popup_service_id,lead_capture_popup_inventory_item_id,lead_capture_popup_minimum_subtotal_cents,lead_capture_popup_success_message,lead_capture_popup_disclosure,businesses(name,email,owner_user_id)").ilike("public_slug",siteSlug).eq("status","published").maybeSingle();
 if(!website||!website.lead_capture_popup_enabled)return popupState("This offer is not active right now.");
 const requestHeaders=await headers();
 const ip=requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()||requestHeaders.get("x-real-ip")||"unknown";
 const ipHash=createHash("sha256").update(`${process.env.WEBSITE_REQUEST_HASH_SALT??"servonas-website"}:${ip}`).digest("hex");
 const oneHourAgo=new Date(Date.now()-60*60*1000).toISOString();
 const {count}=await db.from("website_discount_leads").select("id",{count:"exact",head:true}).eq("business_id",website.business_id).eq("submitted_ip_hash",ipHash).gte("created_at",oneHourAgo);
 if((count??0)>=5)return popupState("Too many discount requests were submitted recently. Please try again later.");
 let customer:null|{id:string;marketing_email_status:string|null}=null;
 const {data:existingCustomer}=await db.from("customers").select("id,marketing_email_status").eq("business_id",website.business_id).eq("is_deleted",false).ilike("email",email).maybeSingle();
 customer=existingCustomer;
 const emailName=email.split("@")[0].replace(/[^a-z0-9]+/gi," ").trim();
 const firstName=emailName.split(/\s+/)[0]||"Website";
 const lastName=emailName.split(/\s+/).slice(1).join(" ")||"Lead";
 if(!customer){
  const created=await db.from("customers").insert({
   business_id:website.business_id,
   first_name:firstName.slice(0,100),
   last_name:lastName.slice(0,100),
   email,
   preferred_contact_method:"email",
   tags:["website-lead","website-discount-lead"],
   lead_source:"Discount Popup",
   marketing_email_status:"unsubscribed",
   is_active:true,
  }).select("id,marketing_email_status").single();
  if(created.error||!created.data)return popupState("This offer could not be saved right now.");
  customer=created.data;
 }
 const business=Array.isArray(website.businesses)?website.businesses[0]:website.businesses;
 const owner=business?.owner_user_id?await db.from("profiles").select("id").eq("id",business.owner_user_id).maybeSingle():{data:null};
 const sharedDiscount=await ensurePopupDiscount(db,{businessId:website.business_id,userId:owner.data?.id??null,businessName:business?.name||"Business",popup:website});
 const now=new Date().toISOString();
 const consentDisclosure=`By submitting, you agree to receive promotional emails from ${business?.name||"this business"}. You can unsubscribe at any time.`;
 const leadPayload={
  business_id:website.business_id,
  website_id:website.id,
  customer_id:customer.id,
  email,
  offer_headline:website.lead_capture_popup_headline??null,
  offer_summary:offerLabel({discountType:website.lead_capture_popup_discount_type,discountValue:website.lead_capture_popup_discount_value==null?null:Number(website.lead_capture_popup_discount_value),customOffer:website.lead_capture_popup_custom_offer??null}),
  offer_discount_type:website.lead_capture_popup_discount_type??null,
  offer_discount_value:website.lead_capture_popup_discount_value==null?null:Number(website.lead_capture_popup_discount_value),
  offer_custom_text:website.lead_capture_popup_custom_offer??null,
  coupon_code:sharedDiscount.couponCode,
  discount_id:sharedDiscount.discountId,
  service_id:website.lead_capture_popup_service_id??null,
  inventory_item_id:website.lead_capture_popup_inventory_item_id??null,
  minimum_subtotal_cents:website.lead_capture_popup_minimum_subtotal_cents??null,
  page_url:text(data,"pageUrl")||null,
  landing_path:text(data,"landingPath")||null,
  referrer:text(data,"referrer")||null,
  utm_source:text(data,"utm_source")||null,
  utm_medium:text(data,"utm_medium")||null,
  utm_campaign:text(data,"utm_campaign")||null,
  utm_content:text(data,"utm_content")||null,
  utm_term:text(data,"utm_term")||null,
  gclid:text(data,"gclid")||null,
  gbraid:text(data,"gbraid")||null,
  wbraid:text(data,"wbraid")||null,
  marketing_consent_granted:true,
  marketing_consented_at:now,
  consent_disclosure:consentDisclosure,
  consent_version:createHash("sha256").update(consentDisclosure).digest("hex").slice(0,16),
  submitted_ip_hash:ipHash,
  user_agent:requestHeaders.get("user-agent")||null,
  updated_at:now,
 };
 const {error:leadError}=await db.from("website_discount_leads").upsert(leadPayload,{onConflict:"business_id,normalized_email"});
 if(leadError){console.error("Website discount lead upsert failed",{businessId:website.business_id,code:leadError.code,message:leadError.message});return popupState("This offer could not be saved right now.");}
 const existingTagsQuery=await db.from("customers").select("tags").eq("business_id",website.business_id).eq("id",customer.id).maybeSingle();
 const tags=[...new Set([...(existingTagsQuery.data?.tags??[]),"website-lead","website-discount-lead"])];
 await db.from("customers").update({marketing_email_status:"subscribed",marketing_email_opted_out_at:null,lead_source:"Discount Popup",tags,updated_at:now}).eq("business_id",website.business_id).eq("id",customer.id);
 const bookingUrl=`${(process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||"https://servonas.com").replace(/\/$/,"")}/book/${siteSlug}`;
 await sendWebsiteLeadCaptureEmail({
  businessId:website.business_id,
  customerId:customer.id,
  customerEmail:email,
  businessName:business?.name||"Service business",
  businessReplyTo:business?.email?.trim()||null,
  subject:`Your ${offerLabel({discountType:website.lead_capture_popup_discount_type,discountValue:website.lead_capture_popup_discount_value==null?null:Number(website.lead_capture_popup_discount_value),customOffer:website.lead_capture_popup_custom_offer??null})} from ${business?.name||"Servonas"}`,
  couponCode:sharedDiscount.couponCode,
  offerLabel:offerLabel({discountType:website.lead_capture_popup_discount_type,discountValue:website.lead_capture_popup_discount_value==null?null:Number(website.lead_capture_popup_discount_value),customOffer:website.lead_capture_popup_custom_offer??null}),
  successMessage:website.lead_capture_popup_success_message||"You're in! Your offer is ready.",
  bookingUrl,
  expiresAt:website.lead_capture_popup_expires_at??null,
 });
 return popupState(undefined,true,null,website.lead_capture_popup_success_message||"Check your email for your offer.");
}
