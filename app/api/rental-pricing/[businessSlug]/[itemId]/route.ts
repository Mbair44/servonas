import {NextResponse} from "next/server";
import {requireWorkspace} from "@/lib/workspace";
import {canManageCustomers} from "@/lib/access";
import {listRentalPricingRules,saveRentalPricingRule,deleteRentalPricingRule} from "@/lib/rentalPricingRuleService";
import {resolveRentalItemPrice} from "@/lib/rentalDatePricing";
type Context={params:Promise<{businessSlug:string;itemId:string}>};
async function handle(request:Request,context:Context){
 const {businessSlug,itemId}=await context.params;
 const {supabase,business,role}=await requireWorkspace(businessSlug);
 if(!canManageCustomers(role))return NextResponse.json({error:"Not authorized"},{status:403});
 try{
  if(request.method==="GET"){
   const q=new URL(request.url).searchParams,date=q.get("date");
   return NextResponse.json(date?await resolveRentalItemPrice(supabase,{businessId:business.id,rentalItemId:itemId,rentalDate:date,rentalEndDate:q.get("endDate")??date,additionalHours:Number(q.get("additionalHours")??0),overnight:q.get("overnight")==="true"}):await listRentalPricingRules(supabase,business.id,itemId),{headers:{"Cache-Control":"no-store"}});
  }
  const body=await request.json();
  if(request.method==="DELETE"){
   if(typeof body.id!=="string")throw new Error("Choose a pricing rule.");
   return NextResponse.json(await deleteRentalPricingRule(supabase,business.id,itemId,body.id));
  }
  if(request.method==="PATCH"&&typeof body.id!=="string")throw new Error("Choose a pricing rule.");
  return NextResponse.json(await saveRentalPricingRule(supabase,business.id,itemId,body,request.method==="PATCH"?body.id:undefined));
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Pricing is unavailable."},{status:400});}
}
export const GET=handle;export const POST=handle;export const PATCH=handle;export const DELETE=handle;
