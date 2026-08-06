import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

const valid=(value:unknown):value is string=>typeof value==="string"&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(value);

export async function POST(request:Request){
 try{
  const {content}=await request.json() as {content?:unknown};
  if(!valid(content))return NextResponse.json({error:"Invalid content lead."},{status:400});
  const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Tracking is unavailable."},{status:503});
  const {error}=await db.rpc("record_marketing_content_click",{p_content_code:content});
  if(error){console.error("Marketing content click could not be recorded",{content,code:error.code});return NextResponse.json({error:"Tracking is unavailable."},{status:500});}
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Invalid request."},{status:400});}
}
