import {NextResponse} from "next/server";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {resolveRentalDatePrice,resolveRentalItemPrice} from "@/lib/rentalDatePricing";
import {applyRentalDatePrice} from "@/lib/rentalPricing";
import {qualifiesForThanksgivingRentalOffer,thanksgivingOfferPricingRules,thanksgivingPricingDate} from "@/lib/thanksgivingRentalOffer";
export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string}>}){
 const {businessSlug}=await params,db=getSupabaseAdmin();
 if(!db)return NextResponse.json({error:"Pricing is temporarily unavailable."},{status:503});
 try{
  const {data:settings}=await db.from("booking_settings").select("business_id").ilike("public_slug",businessSlug).eq("enabled",true).maybeSingle();
  if(!settings)return NextResponse.json({error:"Booking page not found."},{status:404});
  const body=await request.json(),ids:unknown[]=Array.isArray(body.itemIds)?body.itemIds:[];
  if(!ids.length||ids.length>50||ids.some(id=>typeof id!=="string")||new Set(ids).size!==ids.length)throw new Error("Choose up to 50 different rental items.");
  const prices=await Promise.all(ids.map(async id=>{
   const rentalDate=String(body.rentalDate??""),rentalEndDate=String(body.rentalEndDate??body.rentalDate??"");
   const price=await resolveRentalItemPrice(db,{businessId:settings.business_id,rentalItemId:id as string,rentalDate,rentalEndDate,additionalHours:body.additionalHours??0,overnight:body.overnight===true});
   const qualifiesForOffer=qualifiesForThanksgivingRentalOffer({offer:body.offer,businessId:settings.business_id,rentalDate,rentalEndDate,item:price.item});
   const offerPrice=qualifiesForOffer?applyRentalDatePrice(await resolveRentalDatePrice(db,{businessId:settings.business_id,rentalItemId:id as string,rentalDate:thanksgivingPricingDate(rentalDate),timeZone:"America/Phoenix"}),price.rentalDays,thanksgivingOfferPricingRules(price.rules)):price;
   // Internal rule IDs remain in server snapshots. Public callers only receive display metadata.
   return {rentalItemId:id,baseUnitPriceCents:offerPrice.dateAdjustedBasePriceCents,originalBasePriceCents:offerPrice.originalBasePriceCents,dateAdjustedBasePriceCents:offerPrice.dateAdjustedBasePriceCents,totalUnitPriceCents:offerPrice.totalUnitPriceCents,finalRentalPriceCents:offerPrice.totalUnitPriceCents+price.durationAdjustmentCents,rentalDays:offerPrice.rentalDays,multiDayAdjustmentCents:offerPrice.totalUnitPriceCents-offerPrice.dateAdjustedBasePriceCents,additionalDayUnitPriceCents:offerPrice.additionalDayUnitPriceCents,durationAdjustmentCents:price.durationAdjustmentCents,appliedDateRuleType:offerPrice.appliedDateRuleType,appliedDateRuleName:offerPrice.appliedDateRuleName,rentalDate:offerPrice.rentalDate};
  }));return NextResponse.json({prices},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Pricing could not be resolved. Please retry."},{status:400});}
}
