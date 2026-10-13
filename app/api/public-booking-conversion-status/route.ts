import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";

const checkoutSessionId=/^cs_(?:test|live)_[A-Za-z0-9_]+$/;

/** Public success pages poll only this non-sensitive confirmation state after Stripe redirects. */
export async function GET(request:Request){
 const sessionId=new URL(request.url).searchParams.get("session_id")?.trim()??"";
 if(!checkoutSessionId.test(sessionId))return NextResponse.json({confirmed:false},{status:400,headers:{"cache-control":"no-store"}});
 const db=getSupabaseAdmin();
 if(!db)return NextResponse.json({confirmed:false},{status:503,headers:{"cache-control":"no-store"}});
 const {data,error}=await db.from("bookings").select("status").eq("stripe_checkout_session_id",sessionId).maybeSingle();
 if(error){console.error("Booking conversion status lookup failed",{code:error.code});return NextResponse.json({confirmed:false},{status:500,headers:{"cache-control":"no-store"}});}
 return NextResponse.json({confirmed:data?.status==="confirmed"},{headers:{"cache-control":"no-store"}});
}
