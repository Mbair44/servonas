import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {sendInvoiceFinancialEmail} from "@/lib/communications/invoiceEmailService";
export const runtime="nodejs";
export async function GET(request:Request){
 const expected=process.env.CRON_SECRET,provided=request.headers.get("authorization");
 if(!expected||provided!==`Bearer ${expected}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const today=new Date().toISOString().slice(0,10);
 const {data,error}=await db.from("invoices").select("id,business_id").lt("due_date",today).in("status",["sent","viewed","partially_paid"]).eq("is_deleted",false).limit(500);
 if(error){console.error("Overdue invoice scan failed",{code:error.code});return NextResponse.json({error:"Scan failed"},{status:500});}
 let processed=0;
 for(const invoice of data??[]){
  const {data:updated,error:updateError}=await db.from("invoices").update({status:"overdue"}).eq("id",invoice.id).eq("business_id",invoice.business_id).in("status",["sent","viewed","partially_paid"]).select("id").maybeSingle();
  if(updateError){console.error("Overdue invoice update failed",{code:updateError.code,invoiceId:invoice.id});continue;}
  if(updated){await db.from("invoice_events").insert({business_id:invoice.business_id,invoice_id:invoice.id,event_type:"overdue"});await sendInvoiceFinancialEmail(invoice.id,"invoice_overdue");processed++;}
 }
 return NextResponse.json({ok:true,processed});
}
