import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export const runtime="nodejs";

export async function GET(request:Request){
 const expected=process.env.CRON_SECRET,provided=request.headers.get("authorization");
 if(!expected||provided!==`Bearer ${expected}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 const db=getSupabaseAdmin();
 if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const {data,error}=await db.rpc("dispatch_due_recurring_jobs");
 if(error){
  console.error("Recurring day-of auto dispatch failed",{code:error.code,message:error.message});
  return NextResponse.json({error:"Auto dispatch failed"},{status:500});
 }
 return NextResponse.json({ok:true,dispatched:Number(data??0)});
}
