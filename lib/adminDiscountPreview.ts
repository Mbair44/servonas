"use server";
import {requireWorkspace} from "@/lib/workspace";
import {canManageCustomers} from "@/lib/access";
import {validateRentalPromo} from "@/lib/discounts";
export async function previewAdminDiscount(slug:string,code:string,subtotalCents:number,customerId?:string){
 const {supabase,business,role}=await requireWorkspace(slug);
 if(!canManageCustomers(role))return {ok:false as const,error:"Permission denied."};
 if(!Number.isSafeInteger(subtotalCents)||subtotalCents<0)return {ok:false as const,error:"Enter a valid rental subtotal."};
 return validateRentalPromo(supabase,{businessId:business.id,code,customerId,items:[{id:"office_rental_subtotal",quantity:1,unitPriceCents:subtotalCents}]});
}
