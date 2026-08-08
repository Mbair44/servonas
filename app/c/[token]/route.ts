import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {refreshCampaignCounts} from "@/lib/communications/customerCampaignDelivery";

export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){
 const {token}=await params,db=getSupabaseAdmin();
 if(!db||!/^[0-9a-f-]{36}$/i.test(token))return NextResponse.redirect(new URL("/",request.url));
 const {data}=await db.from("customer_campaign_recipients").select("campaign_id,tracked_url,clicked_at").eq("tracking_token",token).maybeSingle();
 if(!data?.tracked_url)return NextResponse.redirect(new URL("/",request.url));
 let target:URL;try{target=new URL(data.tracked_url);if(!["http:","https:"].includes(target.protocol))throw new Error();}catch{return NextResponse.redirect(new URL("/",request.url));}
 if(!data.clicked_at){await db.from("customer_campaign_recipients").update({clicked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("tracking_token",token).is("clicked_at",null);await refreshCampaignCounts(data.campaign_id);}
 return NextResponse.redirect(target,302);
}
