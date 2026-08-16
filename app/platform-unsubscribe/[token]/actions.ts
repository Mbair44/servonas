"use server";

import {redirect} from "next/navigation";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export async function unsubscribePlatformEmail(token:string){
 const db=getSupabaseAdmin();if(!db||!/^[0-9a-f-]{36}$/i.test(token))redirect(`/platform-unsubscribe/${token}?error=1`);
 const {data:recipient}=await db.from("platform_email_recipients").select("id,recipient_email").eq("tracking_token",token).maybeSingle();
 if(!recipient)redirect(`/platform-unsubscribe/${token}?error=1`);
 const now=new Date().toISOString(),email=recipient.recipient_email.trim().toLowerCase();
 const [{error:optOutError},{error:recipientError}]=await Promise.all([
  db.from("platform_email_opt_outs").upsert({email,recipient_id:recipient.id,opted_out_at:now},{onConflict:"email"}),
  db.from("platform_email_recipients").update({unsubscribed_at:now,updated_at:now}).eq("id",recipient.id),
 ]);
 if(optOutError||recipientError)redirect(`/platform-unsubscribe/${token}?error=1`);
 redirect(`/platform-unsubscribe/${token}?success=1`);
}
