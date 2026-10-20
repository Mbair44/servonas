import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {syncGoogleBusinessReviews} from "@/lib/googleBusinessProfile";

// Deliberately opt-in: deploy the schema and validate Google scope/quota before
// setting GOOGLE_REVIEW_SYNC_ENABLED=true and scheduling this endpoint.
export async function GET(request:Request){
 if(process.env.CRON_SECRET&&request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 if(process.env.GOOGLE_REVIEW_SYNC_ENABLED!=="true")return NextResponse.json({ok:true,disabled:true});
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Supabase unavailable"},{status:503});
 const {data:connections,error}=await db.from("business_google_profile_connections").select("business_id").eq("status","connected");
 if(error)return NextResponse.json({error:"Could not load Google connections"},{status:500});
 const results=await Promise.all((connections??[]).map(async row=>{try{return {businessId:row.business_id,...await syncGoogleBusinessReviews(row.business_id)};}catch(error){return {businessId:row.business_id,ok:false,error:error instanceof Error?error.message:"sync failed"};}}));
 return NextResponse.json({ok:true,results});
}
