import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {stripeClient} from "@/lib/stripeConnect";
import {reconcilePlatformFeeCases} from "@/lib/pricing/reconciliationWorker";
export const runtime="nodejs";
export async function GET(request:Request){const secret=process.env.CRON_SECRET;if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"Unauthorized"},{status:401});const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Unavailable"},{status:503});try{return NextResponse.json(await reconcilePlatformFeeCases(db,stripeClient(),50));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Failed"},{status:500});}}
