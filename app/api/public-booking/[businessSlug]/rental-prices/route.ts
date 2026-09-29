import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {resolveRentalItemPrice} from "@/lib/rentalDatePricing";
export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,db=getSupabaseAdmin();
 if(!db)return NextResponse.json({error:"Pricing is temporarily unavailable."},{status:503});
 try{
  const {data:settings}=await db.from("booking_settings").select("business_id").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();
  if(!settings)return NextResponse.json({error:"Booking page not found."},{status:404});
  const body=await request.json(),ids:unknown[]=Array.isArray(body.itemIds)?body.itemIds:[];
  if(!ids.length||ids.length>50||ids.some(id=>typeof id!=="string")||new Set(ids).size!==ids.length)throw new Error("Choose up to 50 different rental items.");
  const prices=await Promise.all(ids.map(async id=>{
   const price=await resolveRentalItemPrice(db,{businessId:settings.business_id,rentalItemId:id as string,rentalDate:String(body.rentalDate??""),rentalEndDate:String(body.rentalEndDate??body.rentalDate??""),additionalHours:body.additionalHours??0,overnight:body.overnight===true});
   // Internal rule IDs remain in server snapshots. Public callers only receive display metadata.
   return {rentalItemId:id,baseUnitPriceCents:price.dateAdjustedBasePriceCents,originalBasePriceCents:price.originalBasePriceCents,dateAdjustedBasePriceCents:price.dateAdjustedBasePriceCents,totalUnitPriceCents:price.totalUnitPriceCents,finalRentalPriceCents:price.finalRentalPriceCents,rentalDays:price.rentalDays,multiDayAdjustmentCents:price.multiDayAdjustmentCents,additionalDayUnitPriceCents:price.additionalDayUnitPriceCents,durationAdjustmentCents:price.durationAdjustmentCents,appliedDateRuleType:price.appliedDateRuleType,appliedDateRuleName:price.appliedDateRuleName,rentalDate:price.rentalDate};
  }));return NextResponse.json({prices},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Pricing could not be resolved. Please retry."},{status:400});}
}
