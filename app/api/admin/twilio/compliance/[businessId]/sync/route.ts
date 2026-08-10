import {NextResponse} from "next/server";
import {syncBusinessComplianceStatus} from "@/lib/twilio/compliance";
import {requireTwilioPlatformAdmin,uuidPattern} from "@/lib/twilio/adminRoute";
export async function POST(_request:Request,{params}:{params:Promise<{businessId:string}>}){const unauthorized=await requireTwilioPlatformAdmin();if(unauthorized)return unauthorized;const {businessId}=await params;if(!uuidPattern.test(businessId))return NextResponse.json({error:"Invalid businessId"},{status:400});try{return NextResponse.json({registration:await syncBusinessComplianceStatus(businessId)});}catch{return NextResponse.json({error:"Compliance synchronization failed and can be retried."},{status:502});}}
