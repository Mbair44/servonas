import {NextResponse} from "next/server";
import {processCustomerMessageMedia} from "@/lib/customerMessages/media";
export const runtime="nodejs";
export async function GET(request:Request){
 if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json({ok:true,...await processCustomerMessageMedia(50)});}catch(error){console.error("MMS media worker failed",{name:error instanceof Error?error.name:"unknown"});return NextResponse.json({error:"MMS processing failed"},{status:500});}
}
