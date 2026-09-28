import {NextResponse} from "next/server";
import {requireWorkspace} from "@/lib/workspace";
import {canManageCustomers} from "@/lib/access";
import {previewRentalDateChange} from "@/lib/bookingManage/datePricePreview";
export async function POST(request:Request,{params}:{params:Promise<{businessSlug:string;bookingId:string}>}){
 const {businessSlug,bookingId}=await params,{supabase,business,role}=await requireWorkspace(businessSlug);
 if(!canManageCustomers(role))return NextResponse.json({error:"Not authorized"},{status:403});
 try{const body=await request.json();return NextResponse.json(await previewRentalDateChange(supabase,{businessId:business.id,bookingId,rentalDate:String(body.rentalDate??""),rentalEndDate:String(body.rentalEndDate??body.rentalDate??"")}));}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Unable to preview this date change."},{status:400});}
}
