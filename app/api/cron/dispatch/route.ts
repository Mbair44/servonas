import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

export const runtime="nodejs";

export async function GET(request:Request){
 const expected=process.env.CRON_SECRET,provided=request.headers.get("authorization");
 if(!expected)return NextResponse.json({error:"Unauthorized",reason:"CRON_SECRET is not configured in this Production deployment."},{status:401});
 if(!provided)return NextResponse.json({error:"Unauthorized",reason:"The Authorization header was not sent."},{status:401});
 if(provided!==`Bearer ${expected}`)return NextResponse.json({error:"Unauthorized",reason:"The bearer token does not match this deployment's CRON_SECRET."},{status:401});
 const db=getSupabaseAdmin();
 if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 const {data,error}=await db.rpc("dispatch_due_recurring_jobs");
 if(error){
  console.error("Recurring day-of auto dispatch failed",{code:error.code,message:error.message});
  return NextResponse.json({error:"Auto dispatch failed"},{status:500});
 }
 return NextResponse.json({ok:true,dispatched:Number(data??0)});
}
