"use server";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {canManageCustomers} from "@/lib/access";
import {zonedDateTimeToUtc} from "@/lib/bookingTime";
import {hasIndustryCapability} from "@/lib/industryCapabilities";
import {requireWorkspace} from "@/lib/workspace";
const text=(data:FormData,key:string)=>String(data.get(key)??"").trim();

export async function moveWeatherAffectedJobs(slug:string,data:FormData){
 const {supabase,business,role}=await requireWorkspace(slug);
 if(!canManageCustomers(role)||!hasIndustryCapability(business.industry_profile,"poolWeatherScheduling"))redirect(`/app/${slug}`);
 const ids=data.getAll("jobId").map(String),date=text(data,"targetDate");
 if(!ids.length||!/^\d{4}-\d{2}-\d{2}$/.test(date))redirect(`/app/${slug}/pool/weather?error=${encodeURIComponent("Select jobs and a valid destination date.")}`);
 const {data:jobs}=await supabase.from("jobs").select("id,starts_at,ends_at").eq("business_id",business.id).in("id",ids).eq("is_deleted",false);
 for(const job of jobs??[]){if(!job.starts_at)continue;const start=new Date(job.starts_at),end=job.ends_at?new Date(job.ends_at):new Date(start.getTime()+60*60_000),parts=new Intl.DateTimeFormat("en-GB",{timeZone:business.timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(start),part=(type:string)=>parts.find(item=>item.type===type)?.value??"00",nextStart=zonedDateTimeToUtc(date,`${part("hour")}:${part("minute")}`,business.timezone),nextEnd=new Date(nextStart.getTime()+(end.getTime()-start.getTime()));await supabase.from("jobs").update({starts_at:nextStart.toISOString(),ends_at:nextEnd.toISOString()}).eq("business_id",business.id).eq("id",job.id)}
 revalidatePath(`/app/${slug}`);revalidatePath(`/app/${slug}/schedule`);revalidatePath(`/app/${slug}/dispatch`);redirect(`/app/${slug}/pool/weather?success=${encodeURIComponent(`${jobs?.length??0} visits moved. Future recurring visits were not changed.`)}`);
}
export async function dismissPoolWeatherAlert(slug:string,data:FormData){
 const {supabase,user,business,role}=await requireWorkspace(slug);if(!canManageCustomers(role)||!hasIndustryCapability(business.industry_profile,"poolWeatherScheduling"))redirect(`/app/${slug}`);
 await supabase.from("pool_weather_alert_dismissals").upsert({business_id:business.id,event_key:text(data,"eventKey"),dismissed_by:user.id},{onConflict:"business_id,event_key"});revalidatePath(`/app/${slug}`);revalidatePath(`/app/${slug}/pool/weather`);redirect(`/app/${slug}/pool/weather?success=Weather+alert+dismissed`);
}
