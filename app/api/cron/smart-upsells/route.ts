import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {dispatchSmartUpsellSmsQueue,scheduleSmartUpsellOffers,smartUpsellAutomationReady} from "@/lib/smartUpsellSms";
import {isAuthorizedCronRequest} from "@/lib/cronAuth";

/** A separate cron keeps promotional work isolated from transactional billing. */
export async function GET(request:Request){
 if(!isAuthorizedCronRequest(request))return NextResponse.json({error:"Unauthorized"},{status:401});
 if(!smartUpsellAutomationReady())return NextResponse.json({disabled:true});
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Unavailable"},{status:503});
 try{const scheduled=await scheduleSmartUpsellOffers(db),delivered=await dispatchSmartUpsellSmsQueue(db);return NextResponse.json({scheduled,delivered});}catch(error){console.error("Smart Upsell cron failed",{message:error instanceof Error?error.message:"unknown"});return NextResponse.json({error:"Smart Upsell scheduling failed"},{status:500});}
}
