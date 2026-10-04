import {NextResponse} from "next/server";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {listStripeTaxCodeCatalog} from "@/lib/stripeTaxCodeCatalog";

/** Authenticated lookup for Stripe's global Tax Code taxonomy. */
export async function GET(){
 const supabase=await createSupabaseServerClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
 const taxCodes=await listStripeTaxCodeCatalog();
 return NextResponse.json({taxCodes},{headers:{"Cache-Control":"private, max-age=3600"}});
}
