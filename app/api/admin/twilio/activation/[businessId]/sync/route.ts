import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {requireTwilioPlatformAdmin,uuidPattern} from "@/lib/twilio/adminRoute";
import {syncPhase3} from "@/lib/twilio/phase3Activation";
export async function POST(_request:Request,{params}:{params:Promise<{businessId:string}>}){const unauthorized=await requireTwilioPlatformAdmin();if(unauthorized)return unauthorized;const {businessId}=await params;if(!uuidPattern.test(businessId))return NextResponse.json({error:"Invalid businessId"},{status:400});const session=await createSupabaseServerClient(),{data:{user}}=await session.auth.getUser();try{return NextResponse.json(await syncPhase3(businessId,user!.id));}catch{return NextResponse.json({error:"Phase 3 synchronization failed and can be retried."},{status:502});}}
