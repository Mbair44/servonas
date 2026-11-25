"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageCustomers} from "@/lib/access";
import {requireWorkspace} from "@/lib/workspace";
import {deliverCampaignRecipient,refreshCampaignCounts} from "@/lib/communications/customerCampaignDelivery";

const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();
const base=(slug:string)=>`/app/${slug}/customers/campaigns`;

export async function createCustomerCampaign(slug:string,data:FormData){
 const {supabase,business,user,role}=await requireWorkspace(slug);if(!canManageCustomers(role))redirect(`${base(slug)}?error=Permission+denied`);
 const name=text(data,"name"),channel=text(data,"channel"),subject=text(data,"subject"),body=text(data,"body"),ids=[...new Set(data.getAll("customerIds").map(String).filter(Boolean))].slice(0,500);
 if(!name||name.length>160)redirect(`${base(slug)}/new?error=${encodeURIComponent("Enter a campaign name up to 160 characters.")}`);
 if(!["email","sms"].includes(channel)||!body||body.length>5000||(channel==="email"&&!subject))redirect(`${base(slug)}/new?error=${encodeURIComponent("Complete the campaign subject and message.")}`);
 if(!ids.length)redirect(`${base(slug)}/new?error=${encodeURIComponent("Select at least one customer.")}`);
 const {data:customers}=await supabase.from("customers").select("id,email,phone,phone_normalized").eq("business_id",business.id).eq("is_deleted",false).eq("is_active",true).in("id",ids);
 if(!customers?.length)redirect(`${base(slug)}/new?error=${encodeURIComponent("No eligible customers were selected.")}`);
 const {data:campaign,error}=await supabase.from("customer_campaigns").insert({business_id:business.id,name,channel,subject:channel==="email"?subject:null,body,status:"draft",recipient_count:customers.length,created_by:user.id}).select("id").single();
 if(error||!campaign){console.error("Campaign creation failed",{businessId:business.id,code:error?.code});redirect(`${base(slug)}/new?error=${encodeURIComponent("Campaign could not be created. Apply the campaign migration first.")}`);}
 const {error:recipientError}=await supabase.from("customer_campaign_recipients").insert(customers.map(customer=>({business_id:business.id,campaign_id:campaign.id,customer_id:customer.id,recipient_address:channel==="email"?customer.email||"":customer.phone_normalized||customer.phone||""})));
 if(recipientError){await supabase.from("customer_campaigns").delete().eq("id",campaign.id).eq("business_id",business.id);redirect(`${base(slug)}/new?error=${encodeURIComponent("Campaign recipients could not be saved.")}`);}
 redirect(`${base(slug)}/${campaign.id}?success=${encodeURIComponent("Campaign draft created. Review it before sending.")}`);
}

export async function sendCustomerCampaign(slug:string,campaignId:string,data:FormData){
 const {supabase,business,role}=await requireWorkspace(slug);if(!canManageCustomers(role))redirect(`${base(slug)}/${campaignId}?error=Permission+denied`);
 if(data.get("confirm")!=="on")redirect(`${base(slug)}/${campaignId}?error=${encodeURIComponent("Confirm that you are ready to send this campaign.")}`);
 const {data:campaign}=await supabase.from("customer_campaigns").select("id,status").eq("id",campaignId).eq("business_id",business.id).maybeSingle();
 if(!campaign||!['draft','partially_failed','failed'].includes(campaign.status))redirect(`${base(slug)}/${campaignId}?error=${encodeURIComponent("This campaign cannot be sent again.")}`);
 const started=await supabase.from("customer_campaigns").update({status:"sending",started_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",campaignId).eq("business_id",business.id);
 if(started.error){console.error("Campaign send could not start",{campaignId,businessId:business.id,code:started.error.code});redirect(`${base(slug)}/${campaignId}?error=${encodeURIComponent("Campaign sending could not start. Please try again.")}`);}
 const {data:recipients,error:recipientError}=await supabase.from("customer_campaign_recipients").select("id,status,provider_message_id").eq("campaign_id",campaignId).eq("business_id",business.id).in("status",["queued","failed"]).limit(500);
 if(recipientError){console.error("Campaign recipients could not be loaded",{campaignId,businessId:business.id,code:recipientError.code});await refreshCampaignCounts(campaignId);redirect(`${base(slug)}/${campaignId}?error=${encodeURIComponent("Campaign recipients could not be loaded. No messages were sent.")}`);}
 for(const recipient of recipients??[]){
  // A provider SID means acceptance was already recorded; retrying could duplicate it.
  if(recipient.status==="failed"&&recipient.provider_message_id)continue;
  if(recipient.status==="failed"){const reset=await supabase.from("customer_campaign_recipients").update({status:"queued",error_message:null,send_claimed_at:null,send_attempt_token:null,updated_at:new Date().toISOString()}).eq("id",recipient.id).eq("business_id",business.id).eq("status","failed").is("provider_message_id",null);if(reset.error){console.error("Campaign recipient could not be retried",{campaignId,recipientId:recipient.id,code:reset.error.code});continue;}}
  await deliverCampaignRecipient(recipient.id);
 }
 await refreshCampaignCounts(campaignId);revalidatePath(`${base(slug)}/${campaignId}`);redirect(`${base(slug)}/${campaignId}?success=${encodeURIComponent("Campaign processing completed. Review the delivery results below.")}`);
}
