import {NextResponse} from "next/server";
import {prepareSmartUpsellCheckout} from "@/lib/smartUpsellCheckout";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
/** Token lookup is read-only; prepareSmartUpsellCheckout applies the authoritative gate before any hold or payment. */
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){const {token}=await params,db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Checkout is temporarily unavailable."},{status:503});try{const staged=await prepareSmartUpsellCheckout(db,{token,origin:new URL(request.url).origin});if(!staged.checkoutUrl)return NextResponse.json({status:"applied"});return NextResponse.redirect(staged.checkoutUrl,303);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Checkout could not be started."},{status:409});}}
