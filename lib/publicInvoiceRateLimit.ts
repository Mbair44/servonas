import type { SupabaseClient } from "@supabase/supabase-js";

const WINDOW_MINUTES=15;
const MAX_REQUESTS=30;

async function fingerprint(requestHeaders:Headers,invoiceId:string){
  const forwarded=requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address=forwarded||requestHeaders.get("x-real-ip")||"unknown";
  const userAgent=(requestHeaders.get("user-agent")||"unknown").slice(0,300);
  const salt=process.env.PUBLIC_LINK_RATE_LIMIT_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||"servonas-public-invoice";
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${salt}|${invoiceId}|${address}|${userAgent}`));
  return Buffer.from(digest).toString("hex");
}

export async function allowPublicInvoiceAccess(
  supabase:SupabaseClient,
  requestHeaders:Headers,
  invoice:{id:string;business_id:string},
){
  const fingerprintHash=await fingerprint(requestHeaders,invoice.id);
  const since=new Date(Date.now()-WINDOW_MINUTES*60_000).toISOString();
  const {count,error}=await supabase.from("public_invoice_access_events").select("id",{count:"exact",head:true})
    .eq("invoice_id",invoice.id).eq("fingerprint_hash",fingerprintHash).eq("was_allowed",true).gte("accessed_at",since);
  if(error){
    console.error("Public invoice rate-limit lookup failed",{code:error.code,invoiceId:invoice.id});
    return false;
  }
  const allowed=(count??0)<MAX_REQUESTS;
  const {error:recordError}=await supabase.from("public_invoice_access_events").insert({
    business_id:invoice.business_id,invoice_id:invoice.id,fingerprint_hash:fingerprintHash,was_allowed:allowed,
  });
  if(recordError){
    console.error("Public invoice access audit failed",{code:recordError.code,invoiceId:invoice.id});
    return false;
  }
  return allowed;
}
