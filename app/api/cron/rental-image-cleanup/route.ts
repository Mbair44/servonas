import {NextResponse} from "next/server";
import {cleanupOrphanedRentalImages} from "@/lib/rentalImageCleanup";

export const runtime="nodejs";

export async function GET(request:Request){
 if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"Unauthorized"},{status:401});
 try{return NextResponse.json({ok:true,...await cleanupOrphanedRentalImages(100)});}catch(error){console.error("Rental image cleanup failed",{name:error instanceof Error?error.name:"unknown"});return NextResponse.json({error:"Rental image cleanup failed"},{status:500});}
}
