"use server";
import {requireWorkspaceCapability} from '@/lib/workspace';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {parseCurrencyToCents} from '@/lib/financial/priceBook';
export async function finalizeRentalProfitability(slug:string,jobId:string,bookingId:string,form:FormData){
 const {supabase,business}=await requireWorkspaceCapability(slug,'job_management');
 const destination=`/app/${slug}/jobs/${jobId}`;
 const {data:booking}=await supabase.from('bookings').select('id').eq('id',bookingId).eq('business_id',business.id).eq('job_id',jobId).maybeSingle();
 if(!booking)redirect(`${destination}?error=Booking+not+found`);
 const costs:Record<string,number>={};
 for(const key of ['labor','delivery','processingFees','other']){const amount=parseCurrencyToCents(String(form.get(key)??''));if(amount==null||amount>2147483647)redirect(`${destination}?error=Review+all+operating+costs`);costs[key]=amount;}
 if(form.get('confirmed')!=='on')redirect(`${destination}?error=Confirm+the+cost+review`);
 const reason=String(form.get('reason')??'').trim();
 const {error}=await supabase.rpc('finalize_booking_profitability',{p_business_id:business.id,p_booking_id:bookingId,p_costs:costs,p_reason:reason||null});
 if(error)redirect(`${destination}?error=${encodeURIComponent(error.message)}`);
 revalidatePath(destination);revalidatePath(`/app/${slug}/rental-inventory`);
 redirect(`${destination}?success=Profitability+costs+finalized`);
}
