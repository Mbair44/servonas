import {NextResponse} from "next/server";
import {requireTwilioPlatformAdmin,uuidPattern} from "@/lib/twilio/adminRoute";
import {getMessagingPeriodReport} from "@/lib/twilio/messageUsage";

const periodPattern=/^\d{4}-(0[1-9]|1[0-2])$/;
export async function GET(request:Request,{params}:{params:Promise<{businessId:string}>}){const unauthorized=await requireTwilioPlatformAdmin();if(unauthorized)return unauthorized;const {businessId}=await params;if(!uuidPattern.test(businessId))return NextResponse.json({error:"Invalid businessId"},{status:400});const month=new URL(request.url).searchParams.get("period")??new Date().toISOString().slice(0,7);if(!periodPattern.test(month))return NextResponse.json({error:"period must use YYYY-MM"},{status:400});try{return NextResponse.json(await getMessagingPeriodReport(businessId,`${month}-01`));}catch{return NextResponse.json({error:"Messaging usage report is unavailable."},{status:502});}}
