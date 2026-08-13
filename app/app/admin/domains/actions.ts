"use server";

import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";
import {normalizeWebsiteDomain} from "@/lib/website";
import {addVercelProjectDomain,buyVercelDomain,getVercelDomainOrder,getVercelDomainQuote,getVercelDomainStatus,vercelStandardDomainMaximumPrice,type VercelRegistrant} from "@/lib/vercelDomains";

const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const destination=(kind:"success"|"error",message:string)=>`/app/admin/domains?${kind}=${encodeURIComponent(message)}`;
const standardLimit=vercelStandardDomainMaximumPrice;

async function platformAdmin(){
 const session=await createSupabaseServerClient(),{data:{user}}=await session.auth.getUser();
 if(!user||!isServonasPlatformAdmin(user))redirect("/app");
 const admin=getSupabaseAdmin();if(!admin)redirect(destination("error","Private admin access is not configured."));
 return {admin,user};
}

export async function checkRequestedDomainAvailability(data:FormData){
 const {admin,user}=await platformAdmin(),businessId=text(data,"businessId"),domain=normalizeWebsiteDomain(text(data,"domain"));
 if(!businessId||!domain)redirect(destination("error","Choose a valid domain request."));
 const {data:request}=await admin.from("business_website_onboarding_states").select("requested_domain").eq("business_id",businessId).maybeSingle();
 if(request?.requested_domain!==domain)redirect(destination("error","That domain no longer matches the business request."));
 let quote:Awaited<ReturnType<typeof getVercelDomainQuote>>;
 try{quote=await getVercelDomainQuote(domain);}catch(error){console.error("Vercel domain quote failed",{businessId,category:error instanceof TypeError?"network":"provider"});redirect(destination("error","Domain availability could not be checked. Confirm the Vercel registrar configuration and try again."));}
 const status=!quote.available?"unavailable":quote.purchasePrice<=standardLimit()?"available":"premium_review",now=new Date().toISOString();
 const {error:quoteSaveError}=await admin.from("website_domain_orders").upsert({business_id:businessId,domain_name:domain,status,purchase_price:quote.purchasePrice,renewal_price:quote.renewalPrice,currency:"USD",registration_years:quote.years,availability_checked_at:now,updated_at:now,updated_by:user.id,created_by:user.id},{onConflict:"business_id,domain_name"});
 if(quoteSaveError)redirect(destination("error","The domain quote could not be saved. Apply the Vercel domain registration migration."));
 await admin.from("business_website_onboarding_states").update({domain_request_status:status,updated_at:now,updated_by:user.id}).eq("business_id",businessId).eq("requested_domain",domain);
 revalidatePath("/app/admin/domains");
 redirect(destination("success",quote.available?`${domain} is available at $${quote.purchasePrice.toFixed(2)} for year one.`:`${domain} is not available.`));
}

export async function purchaseRequestedDomain(data:FormData){
 const {admin,user}=await platformAdmin(),businessId=text(data,"businessId"),domain=normalizeWebsiteDomain(text(data,"domain")),confirmation=text(data,"confirmation");
 if(!businessId||!domain||confirmation!==`REGISTER ${domain}`)redirect(destination("error",`Type REGISTER ${domain??"domain"} to confirm this non-refundable purchase.`));
 const [{data:request},{data:order}]=await Promise.all([admin.from("business_website_onboarding_states").select("requested_domain,domain_request_status").eq("business_id",businessId).maybeSingle(),admin.from("website_domain_orders").select("id,status,provider_order_id,purchase_price").eq("business_id",businessId).eq("domain_name",domain).maybeSingle()]);
 if(request?.requested_domain!==domain||!order)redirect(destination("error","Check domain availability before purchasing."));
 if(order.provider_order_id||["registration_pending","registered","connected"].includes(order.status))redirect(destination("error","This domain already has a Vercel registration order. It was not purchased again."));
 const registrant:VercelRegistrant={firstName:text(data,"firstName"),lastName:text(data,"lastName"),email:text(data,"email"),phone:text(data,"phone"),address1:text(data,"address1"),address2:text(data,"address2")||undefined,city:text(data,"city"),state:text(data,"state"),zip:text(data,"zip"),country:text(data,"country").toUpperCase(),companyName:text(data,"companyName")||undefined};
 if(!registrant.firstName||!registrant.lastName||!/^\S+@\S+\.\S+$/.test(registrant.email)||!/^\+[1-9]\d{7,14}$/.test(registrant.phone)||!registrant.address1||!registrant.city||!registrant.state||!registrant.zip||!/^[A-Z]{2}$/.test(registrant.country))redirect(destination("error","Complete the registrant contact information. Phone must use E.164 format, such as +14805551234."));
 let quote:Awaited<ReturnType<typeof getVercelDomainQuote>>;
 try{quote=await getVercelDomainQuote(domain);}catch(error){console.error("Vercel domain purchase quote failed",{businessId,category:error instanceof TypeError?"network":"provider"});redirect(destination("error","The domain price could not be confirmed, so nothing was purchased."));}
 if(!quote.available)redirect(destination("error","The domain is no longer available and was not purchased."));
 if(quote.purchasePrice>standardLimit())redirect(destination("error",`This premium domain costs $${quote.purchasePrice.toFixed(2)} and is not included in the standard-domain offer.`));
 if(Number(order.purchase_price)!==quote.purchasePrice)redirect(destination("error","The domain price changed. Review the updated quote before purchasing."));
 const {data:claimed}=await admin.from("website_domain_orders").update({status:"registration_pending",purchase_confirmed_at:new Date().toISOString(),updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",order.id).eq("status","available").is("provider_order_id",null).select("id").maybeSingle();
 if(!claimed)redirect(destination("error","Another registration attempt already started. The domain was not purchased again."));
 try{
  const result=await buyVercelDomain(domain,quote.purchasePrice,registrant),now=new Date(),renewalNotice=new Date(now);renewalNotice.setUTCDate(renewalNotice.getUTCDate()+335);
  await admin.from("website_domain_orders").update({provider_order_id:result.orderId,renewal_notice_at:renewalNotice.toISOString(),updated_at:now.toISOString(),updated_by:user.id,last_error_category:null}).eq("id",order.id).is("provider_order_id",null);
  await admin.from("business_website_onboarding_states").update({domain_request_status:"registration_pending",updated_at:now.toISOString(),updated_by:user.id}).eq("business_id",businessId).eq("requested_domain",domain);
  await admin.from("business_website_settings").update({custom_domain:domain,domain_status:"pending_verification",updated_at:now.toISOString(),updated_by:user.id}).eq("business_id",businessId);
  try{await addVercelProjectDomain(domain);}catch{console.error("Purchased domain project attachment pending",{businessId,category:"project_attachment"});}
 }catch(error){console.error("Vercel domain purchase failed",{businessId,category:error instanceof TypeError?"network":"provider"});await admin.from("website_domain_orders").update({status:"failed",last_error_category:error instanceof TypeError?"network":"provider",updated_at:new Date().toISOString(),updated_by:user.id}).eq("id",order.id).is("provider_order_id",null);redirect(destination("error","Vercel did not accept the domain purchase. No retry was attempted automatically."));}
 revalidatePath("/app/admin/domains");revalidatePath(`/sites/domain/${domain}`);
 redirect(destination("success",`${domain} was submitted to Vercel for registration. Do not retry while the order is pending.`));
}

export async function syncRequestedDomainRegistration(data:FormData){
 const {admin,user}=await platformAdmin(),businessId=text(data,"businessId"),domain=normalizeWebsiteDomain(text(data,"domain"));
 if(!businessId||!domain)redirect(destination("error","Choose a valid domain order."));
 const {data:order}=await admin.from("website_domain_orders").select("id,provider_order_id").eq("business_id",businessId).eq("domain_name",domain).maybeSingle();
 if(!order?.provider_order_id)redirect(destination("error","No Vercel order exists for this domain."));
 let provider:Awaited<ReturnType<typeof getVercelDomainOrder>>;
 try{provider=await getVercelDomainOrder(order.provider_order_id);}catch(error){console.error("Vercel domain order sync failed",{businessId,category:error instanceof TypeError?"network":"provider"});redirect(destination("error","The Vercel order status could not be synchronized."));}
 const now=new Date().toISOString();
 if(provider.status==="failed"){
  await admin.from("website_domain_orders").update({status:"failed",last_error_category:"provider_order_failed",updated_at:now,updated_by:user.id}).eq("id",order.id);
  await admin.from("business_website_onboarding_states").update({domain_request_status:"failed",updated_at:now,updated_by:user.id}).eq("business_id",businessId).eq("requested_domain",domain);
  redirect(destination("error","Vercel reports that the registration order failed. It was not retried."));
 }
 if(provider.status!=="completed")redirect(destination("success","Vercel is still processing this registration. Do not submit another purchase."));
 let hosting:Awaited<ReturnType<typeof getVercelDomainStatus>>;
 try{await addVercelProjectDomain(domain);hosting=await getVercelDomainStatus(domain);}catch(error){console.error("Registered domain attachment sync failed",{businessId,category:error instanceof TypeError?"network":"provider"});redirect(destination("error","The domain is registered, but its hosting connection could not be synchronized yet."));}
 const status=hosting.verified&&!hosting.misconfigured?"connected":"registered";
 await admin.from("website_domain_orders").update({status,registered_at:now,updated_at:now,updated_by:user.id,last_error_category:null}).eq("id",order.id);
 await admin.from("business_website_onboarding_states").update({domain_request_status:status,updated_at:now,updated_by:user.id}).eq("business_id",businessId).eq("requested_domain",domain);
 await admin.from("business_website_settings").update({custom_domain:domain,domain_status:status==="connected"?"connected":"pending_verification",updated_at:now,updated_by:user.id}).eq("business_id",businessId);
 revalidatePath("/app/admin/domains");redirect(destination("success",status==="connected"?`${domain} is registered and connected.`:`${domain} is registered; hosting connection is still finishing.`));
}
