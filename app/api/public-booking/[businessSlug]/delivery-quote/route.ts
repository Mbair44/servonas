import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {verifyGooglePlace} from "@/lib/googleAddress";
import {deliveryQuoteMessage,quoteBusinessDelivery} from "@/lib/deliveryQuote";

export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params;
 try{
  const body=await request.json() as {googlePlaceId?:string};
  if(!body.googlePlaceId)return NextResponse.json({error:"Choose a complete delivery address from the suggestions."},{status:400});
  const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Delivery calculation is temporarily unavailable."},{status:503});
  const [{data:booking},destination]=await Promise.all([db.from("booking_settings").select("business_id").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle(),verifyGooglePlace(body.googlePlaceId)]);
  if(!booking)return NextResponse.json({error:"This booking page is unavailable."},{status:404});
  if(!destination)return NextResponse.json({error:"We couldn't verify that delivery address. Choose an address suggestion and try again."},{status:400});
  const quote=await quoteBusinessDelivery(db,booking.business_id,destination);
  return NextResponse.json(quote??{enabled:false,eligible:true,requiresQuote:false,feeCents:0});
 }catch(error){
  console.error("Delivery quote failed",{businessSlug,operation:"delivery_quote",errorCode:error instanceof Error?error.message:"unknown"});
  return NextResponse.json({error:deliveryQuoteMessage(error),code:"delivery_quote_unavailable"},{status:503});
 }
}
