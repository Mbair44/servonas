import QRCode from "qrcode";
import {NextResponse} from "next/server";
import {requireWorkspace} from "@/lib/workspace";
import {canManageBusiness} from "@/lib/access";
import {giveawayQrUrl} from "@/lib/eventGiveaway";

export async function GET(request:Request,{params}:{params:Promise<{businessSlug:string;giveawayId:string}>}){
 const {businessSlug,giveawayId}=await params,context=await requireWorkspace(businessSlug);
 if(!canManageBusiness(context.role))return NextResponse.json({error:"Forbidden"},{status:403});
 const {data:giveaway}=await context.supabase.from("event_giveaways").select("slug,attribution_campaign").eq("business_id",context.business.id).eq("id",giveawayId).maybeSingle();
 if(!giveaway)return NextResponse.json({error:"Giveaway not found"},{status:404});
 const {data:site}=await context.supabase.from("business_website_settings").select("custom_domain,domain_status,public_slug").eq("business_id",context.business.id).maybeSingle();
 const origin=site?.domain_status==="connected"&&site.custom_domain?`https://${site.custom_domain}`:`${new URL(request.url).origin}/sites/${site?.public_slug||context.business.slug}`;
 const payload=giveawayQrUrl(origin,giveaway.slug,giveaway.attribution_campaign);
 const format=new URL(request.url).searchParams.get("format")==="svg"?"svg":"png";
 const value=format==="svg"?await QRCode.toString(payload,{type:"svg",margin:2,width:1024}):await QRCode.toBuffer(payload,{type:"png",margin:2,width:1024});
 return new NextResponse(typeof value==="string"?value:new Uint8Array(value),{headers:{"Content-Type":format==="svg"?"image/svg+xml":"image/png","Content-Disposition":`attachment; filename="${giveaway.slug}-qr.${format}"`,"Cache-Control":"private, no-store"}});
}
