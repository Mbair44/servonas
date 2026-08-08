import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {refreshCampaignCounts} from "@/lib/communications/customerCampaignDelivery";

const pixel=Buffer.from("R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=","base64");
export async function GET(_:Request,{params}:{params:Promise<{token:string}>}){
 const {token}=await params,db=getSupabaseAdmin();
 if(db&&/^[0-9a-f-]{36}$/i.test(token)){
  const {data}=await db.from("customer_campaign_recipients").update({opened_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("tracking_token",token).is("opened_at",null).select("campaign_id").maybeSingle();
  if(data?.campaign_id)await refreshCampaignCounts(data.campaign_id);
 }
 return new NextResponse(pixel,{headers:{"Content-Type":"image/gif","Content-Length":String(pixel.length),"Cache-Control":"no-store, max-age=0"}});
}
