"use server";

import {redirect} from "next/navigation";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export async function unsubscribeCampaignEmail(token:string){
 if(!/^[0-9a-f-]{36}$/i.test(token))redirect("/unsubscribe/invalid?error=invalid");
 const db=getSupabaseAdmin();if(!db)redirect(`/unsubscribe/${token}?error=unavailable`);
 const {data:recipient}=await db.from("customer_campaign_recipients").select("id,business_id,customer_id,customers(email),customer_campaigns(channel)").eq("tracking_token",token).maybeSingle();
 const campaign=Array.isArray(recipient?.customer_campaigns)?recipient.customer_campaigns[0]:recipient?.customer_campaigns;
 if(!recipient||campaign?.channel!=="email")redirect(`/unsubscribe/${token}?error=invalid`);
 const now=new Date().toISOString();
 const {error}=await db.from("customers").update({marketing_email_status:"unsubscribed",marketing_email_opted_out_at:now,updated_at:now}).eq("id",recipient.customer_id).eq("business_id",recipient.business_id);
 if(error)redirect(`/unsubscribe/${token}?error=unavailable`);
 const customer=Array.isArray(recipient.customers)?recipient.customers[0]:recipient.customers;
 if(customer?.email){await db.from("customer_contact_channels").upsert({business_id:recipient.business_id,customer_id:recipient.customer_id,channel_type:"email",normalized_value:customer.email.trim().toLowerCase(),display_value:customer.email,consent_status:"unsubscribed",consent_recorded_at:now,consent_source:"campaign_unsubscribe",is_primary:true,is_active:true,updated_at:now},{onConflict:"business_id,customer_id,channel_type,normalized_value"});}
 await db.from("customer_campaign_recipients").update({unsubscribed_at:now,updated_at:now}).eq("id",recipient.id);
 redirect(`/unsubscribe/${token}?success=1`);
}
