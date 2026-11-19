import {NextResponse} from "next/server";
import {processCustomerMessageMedia} from "@/lib/customerMessages/media";
import {isAuthorizedCronRequest} from "@/lib/cronAuth";
export const runtime="nodejs";
export async function GET(request:Request){
 if(!isAuthorizedCronRequest(request))return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json({ok:true,...await processCustomerMessageMedia(50)});}catch(error){console.error("MMS media worker failed",{name:error instanceof Error?error.name:"unknown"});return NextResponse.json({error:"MMS processing failed"},{status:500});}
}
