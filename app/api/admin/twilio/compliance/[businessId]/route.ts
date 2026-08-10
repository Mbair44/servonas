import {NextResponse} from "next/server";
import {getBusinessComplianceStatus} from "@/lib/twilio/compliance";
import {requireTwilioPlatformAdmin,uuidPattern} from "@/lib/twilio/adminRoute";
export async function GET(_request:Request,{params}:{params:Promise<{businessId:string}>}){const unauthorized=await requireTwilioPlatformAdmin();if(unauthorized)return unauthorized;const {businessId}=await params;if(!uuidPattern.test(businessId))return NextResponse.json({error:"Invalid businessId"},{status:400});try{return NextResponse.json({registration:await getBusinessComplianceStatus(businessId)});}catch{return NextResponse.json({error:"Compliance status is unavailable."},{status:502});}}
