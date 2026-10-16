import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {eligibleCustomerAddons} from "@/lib/customerAddonEligibility";
import {customerCatalogAddonsUiEnabled} from "@/lib/customerCatalogAddonFeature";

const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const date=/^\d{4}-\d{2}-\d{2}$/;
const time=/^\d{2}:\d{2}$/;

export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 if(!customerCatalogAddonsUiEnabled())return NextResponse.json({error:"Not found."},{status:404});
 const db=getSupabaseAdmin();if(!db)return NextResponse.json({error:"Add-ons are temporarily unavailable."},{status:503});
 try{
  const {businessSlug}=await params,body=await request.json(),rentalItemIds=Array.isArray(body.rentalItemIds)?body.rentalItemIds:[];
  if(!date.test(String(body.date??""))||!time.test(String(body.startTime??""))||!time.test(String(body.endTime??""))||!rentalItemIds.length||rentalItemIds.length>50||rentalItemIds.some((id:unknown)=>typeof id!=="string"||!uuid.test(id))||new Set(rentalItemIds).size!==rentalItemIds.length)throw Error("Choose a valid rental date, time, and rentals.");
  const {data:settings}=await db.from("booking_settings").select("business_id").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();
  if(!settings)return NextResponse.json({error:"Booking page not found."},{status:404});
  const {count,error:inventoryError}=await db.from("inventory_items").select("id",{count:"exact",head:true}).eq("business_id",settings.business_id).eq("active",true).in("id",rentalItemIds);
  if(inventoryError||count!==rentalItemIds.length)return NextResponse.json({error:"The selected rentals are no longer available."},{status:400});
  const addons=await eligibleCustomerAddons(db,{businessId:settings.business_id,rentalItemIds,date:body.date,startTime:body.startTime,endTime:body.endTime});
  return NextResponse.json({addons:addons.map((addon:any)=>({id:addon.id,name:addon.name,description:addon.description??null,imageUrl:addon.image_url??null,unitPriceCents:Number(addon.default_unit_price_cents),maxQuantity:Math.max(1,Number(addon.max_customer_quantity??1))}))},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Add-ons could not be loaded."},{status:400});}
}
