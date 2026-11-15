import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {managedImageVariantPathsFromPublicUrl} from "@/lib/storageImageVariants";

const bucket="inventory-images";
const retryAt=(attempts:number)=>new Date(Date.now()+Math.min(3_600_000,60_000*2**Math.min(attempts,6))).toISOString();

type CleanupJob={id:string;business_id:string;image_url:string;attempt_count:number};

/**
 * Removes only objects that are no longer referenced by either canonical or
 * compatibility gallery metadata. Jobs are queued by a database trigger after
 * the gallery transaction commits, so a failed storage call never rolls back
 * customer-visible gallery data.
 */
export async function cleanupOrphanedRentalImages(limit=100){
 const db=getSupabaseAdmin();if(!db)throw new Error("Rental image storage is unavailable.");
 const {data,error}=await db.from("rental_image_cleanup_jobs").select("id,business_id,image_url,attempt_count").lte("next_attempt_at",new Date().toISOString()).order("next_attempt_at").limit(Math.min(Math.max(limit,1),500));
 if(error)throw new Error("Rental image cleanup queue is unavailable.");
 let removed=0,released=0,failed=0;
 for(const job of (data??[]) as CleanupJob[]){
  // Claim each job before its final reference check to make retries safe when
  // multiple cron invocations overlap.
  const claim=await db.from("rental_image_cleanup_jobs").update({next_attempt_at:new Date(Date.now()+5*60_000).toISOString()}).eq("id",job.id).lte("next_attempt_at",new Date().toISOString()).select("id").maybeSingle();
  if(!claim.data)continue;
  try{
   const [canonical,primary,compatibility]=await Promise.all([
    db.from("rental_item_images").select("id").eq("image_url",job.image_url).limit(1),
    db.from("inventory_items").select("id").eq("image_url",job.image_url).limit(1),
    db.from("inventory_items").select("id").contains("image_urls",[job.image_url]).limit(1),
   ]);
   if(canonical.error||primary.error||compatibility.error)throw new Error("gallery_reference_check_failed");
   if((canonical.data?.length??0)+(primary.data?.length??0)+(compatibility.data?.length??0)>0){await db.from("rental_image_cleanup_jobs").delete().eq("id",job.id);released++;continue;}
   const paths=managedImageVariantPathsFromPublicUrl(job.image_url,bucket);
   if(paths.length){const result=await db.storage.from(bucket).remove(paths);if(result.error)throw result.error;}
   const deletion=await db.from("rental_image_cleanup_jobs").delete().eq("id",job.id);if(deletion.error)throw deletion.error;removed++;
  }catch(error){failed++;const attempts=Number(job.attempt_count)+1,reason=(error instanceof Error?error.message:"rental_image_cleanup_failed").slice(0,300);await db.from("rental_image_cleanup_jobs").update({attempt_count:attempts,next_attempt_at:retryAt(attempts),last_error:reason}).eq("id",job.id);console.error("Rental image cleanup retry scheduled",{jobId:job.id,attempts,name:error instanceof Error?error.name:"unknown"});}
 }
 return {removed,released,failed};
}
