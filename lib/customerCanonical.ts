import type {SupabaseClient} from "@supabase/supabase-js";

type CustomerDb=Pick<SupabaseClient,"from"|"rpc">;

/** Resolves a staff-authorized CRM reference; never use this for public tokens. */
export async function canonicalCustomerScope(db:CustomerDb,businessId:string,customerId:string){
 const {data:canonical,error}=await db.rpc("resolve_canonical_customer_id",{p_business_id:businessId,p_customer_id:customerId});
 if(error||!canonical)return null;
 const {data:members,error:memberError}=await db.from("customer_canonical_memberships")
  .select("customer_id").eq("business_id",businessId).eq("canonical_customer_id",canonical);
 if(memberError)return null;
 return {canonicalCustomerId:canonical as string,customerIds:(members??[]).map((row:{customer_id:string})=>row.customer_id)};
}

export function activeCanonicalCustomerIds<T extends {id:string;is_deleted:boolean;is_active:boolean;merged_into_customer_id?:string|null}>(customers:T[]){
 return customers.filter(customer=>!customer.is_deleted&&customer.is_active&&!customer.merged_into_customer_id).map(customer=>customer.id);
}
