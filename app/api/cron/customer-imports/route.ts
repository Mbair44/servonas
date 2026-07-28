import{NextResponse}from"next/server";import{getSupabaseAdmin}from"@/lib/supabaseAdmin";
export async function GET(request:Request){
 const secret=process.env.CRON_SECRET;if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 const supabase=getSupabaseAdmin();if(!supabase)return NextResponse.json({error:"Supabase unavailable"},{status:503});
 const {data:imports,error}=await supabase.from("customer_imports").select("id,business_id,version").eq("status","queued").order("last_activity_at").limit(3);if(error){console.error("Customer import worker query failed",{code:error.code});return NextResponse.json({error:"Worker query failed"},{status:500});}
 const results=[];for(const item of imports??[]){const started=Date.now(),{data,error:commitError}=await supabase.rpc("commit_customer_import",{p_import_id:item.id,p_expected_version:item.version,p_ready_only:true});if(commitError)console.error("Customer import worker failed",{importId:item.id,businessId:item.business_id,code:commitError.code,durationMs:Date.now()-started});results.push({importId:item.id,ok:!commitError,result:commitError?undefined:data,errorCode:commitError?.code??null,durationMs:Date.now()-started});}
 return NextResponse.json({processed:results.length,results});
}
