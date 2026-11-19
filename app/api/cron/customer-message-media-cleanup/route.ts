import {NextResponse} from "next/server";
import {cleanupAbandonedCustomerMessageMedia} from "@/lib/customerMessages/media";
import {isAuthorizedCronRequest} from "@/lib/cronAuth";
export const runtime="nodejs";
export async function GET(request:Request){
 if(!isAuthorizedCronRequest(request))return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json({ok:true,...await cleanupAbandonedCustomerMessageMedia(100)});}catch(error){console.error("MMS media cleanup failed",{name:error instanceof Error?error.name:"unknown"});return NextResponse.json({error:"MMS cleanup failed"},{status:500});}
}
