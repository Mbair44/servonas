import { getSupabaseAdmin } from "./supabaseAdmin";
export async function getBusinessBySlug(slug:string){
  const supabase=getSupabaseAdmin();
  if(!supabase) return null;
  const {data,error}=await supabase.from("businesses").select("*").eq("slug",slug).maybeSingle();
  if(error) throw error;
  return data;
}
export function requireBusinessId(businessId:string|undefined){if(!businessId) throw new Error("A business_id is required for tenant-scoped operations.");return businessId;}
