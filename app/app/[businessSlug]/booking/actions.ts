"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspaceCapability } from "@/lib/workspace";
import { canManageBusiness, canManageCustomers } from "@/lib/access";
import { zonedDateTimeToUtc } from "@/lib/bookingTime";
const text=(f:FormData,k:string)=>String(f.get(k)??"").trim();
const checked=(f:FormData,k:string)=>f.get(k)==="on";
const number=(f:FormData,k:string,fallback=0)=>{const n=Number(text(f,k));return Number.isFinite(n)?n:fallback;};
const refresh=(slug:string)=>{revalidatePath(`/app/${slug}/booking`);revalidatePath(`/book/${slug}`);};
export async function saveBookingSettings(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"online_booking"); if(!canManageBusiness(role)) redirect(`/app/${slug}/booking?error=Only+owners+and+admins+can+change+booking+settings`);
 if(formData.has("additionalDayPricingType")){
  if(business.industry_profile!=="party_rental")redirect(`/app/${slug}/booking?error=Permission+denied`);
  const standardHours=number(formData,"standardRentalHours",24),discountPercent=number(formData,"additionalDayDiscountPercent",0),flatRateRaw=text(formData,"additionalDayFlatRate"),maxDaysRaw=text(formData,"maxRentalDays"),pricingType=text(formData,"additionalDayPricingType")||"full_price";
  if(!Number.isInteger(standardHours)||standardHours<1||standardHours>168||!["full_price","percentage_discount","flat_rate"].includes(pricingType)||discountPercent<0||discountPercent>100||(flatRateRaw&&Number(flatRateRaw)<0)||(maxDaysRaw&&(!Number.isInteger(Number(maxDaysRaw))||Number(maxDaysRaw)<1||Number(maxDaysRaw)>365)))redirect(`/app/${slug}/booking?error=Review+the+multi-day+rental+settings`);
  const {error}=await supabase.from("booking_settings").update({standard_rental_hours:standardHours,allow_multi_day_rentals:checked(formData,"allowMultiDayRentals"),additional_day_pricing_type:pricingType,additional_day_discount_percent:discountPercent,additional_day_flat_rate_cents:flatRateRaw?Math.round(Number(flatRateRaw)*100):null,max_rental_days:maxDaysRaw?Number(maxDaysRaw):null,updated_at:new Date().toISOString(),updated_by:user.id}).eq("business_id",business.id);
  if(error){console.error("Rental pricing settings save failed",{businessId:business.id,code:error.code});redirect(`/app/${slug}/booking?error=Rental+pricing+could+not+be+saved.+Apply+the+latest+database+migration`);}
  refresh(slug);redirect(`/app/${slug}/booking?success=Rental+pricing+updated`);
 }
 const publicSlug=text(formData,"publicSlug").toLowerCase(); if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(publicSlug)) redirect(`/app/${slug}/booking?error=Use+letters,+numbers,+and+hyphens+for+the+public+slug`);
 const brand=text(formData,"brandColor"); if(!/^#[0-9a-fA-F]{6}$/.test(brand)) redirect(`/app/${slug}/booking?error=Brand+color+must+be+a+6-digit+hex+color`);
 const questions=text(formData,"intakeQuestions").split("\n").map(q=>q.trim()).filter(Boolean).slice(0,10);const limitRaw=text(formData,"dailyAppointmentLimit");
 const managerPhone=text(formData,"bookingManagerPhone");
 if(managerPhone&&managerPhone.replace(/\D/g,"").length<10)redirect(`/app/${slug}/booking?error=Enter+a+valid+booking+manager+phone+number`);
 const rentalDuration=number(formData,"rentalDurationMinutes",240);if(business.industry_profile==="party_rental"&&(!Number.isInteger(rentalDuration)||rentalDuration<30||rentalDuration>720||rentalDuration%30!==0))redirect(`/app/${slug}/booking?error=Rental+length+must+use+30-minute+increments`);
 const {error}=await supabase.from("booking_settings").upsert({business_id:business.id,enabled:checked(formData,"enabled"),public_slug:publicSlug,logo_url:text(formData,"logoUrl")||null,brand_color:brand,welcome_message:text(formData,"welcomeMessage"),confirmation_message:text(formData,"confirmationMessage"),timezone:text(formData,"timezone")||"America/Phoenix",minimum_notice_hours:number(formData,"minimumNoticeHours",2),maximum_days_ahead:number(formData,"maximumDaysAhead",60),buffer_minutes:number(formData,"bufferMinutes",business.industry_profile==="party_rental"?60:0),daily_appointment_limit:limitRaw?number(formData,"dailyAppointmentLimit"):null,rental_duration_minutes:business.industry_profile==="party_rental"?rentalDuration:240,intake_questions:questions,auto_confirm:checked(formData,"autoConfirm"),collect_address:checked(formData,"collectAddress"),booking_manager_phone:managerPhone||null,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:"business_id"});
 if(error){console.error(error);redirect(`/app/${slug}/booking?error=${encodeURIComponent(error.code==="23505"?"That public booking slug is already in use.":"We couldn’t save booking settings.")}`)} refresh(slug);redirect(`/app/${slug}/booking?success=Booking+settings+saved`);
}
export async function saveRentalDeposit(slug:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"online_booking");
 if(!canManageBusiness(role)||business.industry_profile!=="party_rental")redirect(`/app/${slug}/booking?error=Permission+denied`);
 const raw=text(formData,"rentalDepositPercent"),percent=Number(raw);
 if(!raw||!Number.isFinite(percent)||percent<0||percent>100)redirect(`/app/${slug}/booking?error=Rental+deposit+must+be+between+0+and+100+percent`);
 const {error}=await supabase.from("booking_settings").update({rental_deposit_percent:percent,updated_at:new Date().toISOString()}).eq("business_id",business.id);
 if(error){console.error("Rental deposit setting save failed",{businessId:business.id,code:error.code});redirect(`/app/${slug}/booking?error=Rental+deposit+could+not+be+saved.+Apply+the+latest+database+migration`);}
 refresh(slug);redirect(`/app/${slug}/booking?success=Rental+deposit+updated`);
}
export async function uploadBookingLogo(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"online_booking");if(!canManageBusiness(role))redirect(`/app/${slug}/booking?error=Only+owners+and+admins+can+change+the+booking+logo`);
 const file=formData.get("logo");
 if(!(file instanceof File)||!file.size)redirect(`/app/${slug}/booking?error=Choose+a+logo+file`);
 const allowed=["image/jpeg","image/png","image/webp"];
 if(file.size>5*1024*1024||!allowed.includes(file.type))redirect(`/app/${slug}/booking?error=Use+a+JPG,+PNG,+or+WebP+logo+under+5MB`);
 const {data:settings}=await supabase.from("booking_settings").select("logo_path,public_slug").eq("business_id",business.id).maybeSingle();
 const extension=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
 const path=`${business.id}/booking-logo-${crypto.randomUUID()}.${extension}`;
 const {error:uploadError}=await supabase.storage.from("booking-branding").upload(path,file,{contentType:file.type,upsert:false});
 if(uploadError){console.error("Booking logo upload failed",{code:uploadError.name,businessId:business.id});redirect(`/app/${slug}/booking?error=The+logo+could+not+be+uploaded`);}
 const {error}=await supabase.from("booking_settings").upsert({business_id:business.id,public_slug:settings?.public_slug??business.slug,logo_path:path,updated_at:new Date().toISOString(),updated_by:user.id},{onConflict:"business_id"});
 if(error){await supabase.storage.from("booking-branding").remove([path]);console.error("Booking logo save failed",{code:error.code,businessId:business.id});redirect(`/app/${slug}/booking?error=The+logo+could+not+be+saved`);}
 if(settings?.logo_path&&settings.logo_path!==path){const {error:removeError}=await supabase.storage.from("booking-branding").remove([settings.logo_path]);if(removeError)console.warn("Previous booking logo cleanup failed",{code:removeError.name,businessId:business.id});}
 refresh(slug);if(settings?.public_slug)revalidatePath(`/book/${settings.public_slug}`);redirect(`/app/${slug}/booking?success=Booking+logo+updated`);
}
export async function removeBookingLogo(slug:string){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"online_booking");if(!canManageBusiness(role))redirect(`/app/${slug}/booking?error=Only+owners+and+admins+can+change+the+booking+logo`);
 const {data:settings}=await supabase.from("booking_settings").select("logo_path,public_slug").eq("business_id",business.id).maybeSingle();
 const {error}=await supabase.from("booking_settings").update({logo_path:null,updated_at:new Date().toISOString(),updated_by:user.id}).eq("business_id",business.id);
 if(error){console.error("Booking logo removal failed",{code:error.code,businessId:business.id});redirect(`/app/${slug}/booking?error=The+logo+could+not+be+removed`);}
 if(settings?.logo_path){const {error:removeError}=await supabase.storage.from("booking-branding").remove([settings.logo_path]);if(removeError)console.warn("Booking logo object cleanup failed",{code:removeError.name,businessId:business.id});}
 refresh(slug);if(settings?.public_slug)revalidatePath(`/book/${settings.public_slug}`);redirect(`/app/${slug}/booking?success=Booking+logo+removed`);
}
export async function createService(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"online_booking");if(!canManageCustomers(role))redirect(`/app/${slug}/booking?error=Permission+denied`);
 const name=text(formData,"name");if(!name)redirect(`/app/${slug}/booking?error=Service+name+is+required`);
 const priceRaw=text(formData,"price");const {error}=await supabase.from("services").insert({business_id:business.id,name,description:text(formData,"description")||null,duration_minutes:number(formData,"duration",60),price_amount:priceRaw?number(formData,"price"):null,price_label:text(formData,"priceLabel")||"fixed",active:true,created_by:user.id,updated_by:user.id});
 if(error){console.error(error);redirect(`/app/${slug}/booking?error=We+couldn’t+add+the+service`)}refresh(slug);redirect(`/app/${slug}/booking?success=Service+added`);
}
export async function toggleService(slug:string,formData:FormData){const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"online_booking");if(!canManageCustomers(role))return;await supabase.from("services").update({active:text(formData,"active")!=="true",updated_at:new Date().toISOString(),updated_by:user.id}).eq("id",text(formData,"serviceId")).eq("business_id",business.id);refresh(slug);}
export async function archiveService(slug:string,formData:FormData){const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"online_booking");if(!canManageCustomers(role))return;await supabase.from("services").update({is_deleted:true,active:false,updated_at:new Date().toISOString(),updated_by:user.id}).eq("id",text(formData,"serviceId")).eq("business_id",business.id);refresh(slug);}
export async function replaceAvailability(slug:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"online_booking");if(!canManageCustomers(role))redirect(`/app/${slug}/booking?error=Permission+denied`);
 const rows=[] as {business_id:string;weekday:number;start_time:string;end_time:string;active:boolean}[];
 for(let d=0;d<7;d++){if(checked(formData,`day_${d}`)){const start=text(formData,`start_${d}`),end=text(formData,`end_${d}`);if(start&&end&&end>start)rows.push({business_id:business.id,weekday:d,start_time:start,end_time:end,active:true});}}
 await supabase.from("booking_availability").delete().eq("business_id",business.id);if(rows.length){const {error}=await supabase.from("booking_availability").insert(rows);if(error){console.error(error);redirect(`/app/${slug}/booking?error=We+couldn’t+save+availability`)}}refresh(slug);redirect(`/app/${slug}/booking?success=Availability+saved`);
}
export async function addBlackout(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"online_booking");if(!canManageCustomers(role))return;
 const starts=localDateTime(text(formData,"startsAt"),business.timezone),ends=localDateTime(text(formData,"endsAt"),business.timezone);
 if(!starts||!ends||ends<=starts)redirect(`/app/${slug}/booking?error=Enter+a+valid+blocked+time+range`);
 await supabase.from("booking_blackouts").insert({business_id:business.id,starts_at:starts.toISOString(),ends_at:ends.toISOString(),reason:text(formData,"reason")||null,created_by:user.id});
 refresh(slug);redirect(`/app/${slug}/booking?success=Blocked+time+added`);
}
export async function deleteBlackout(slug:string,formData:FormData){const {supabase,business,role}=await requireWorkspaceCapability(slug,"online_booking");if(!canManageCustomers(role))return;await supabase.from("booking_blackouts").delete().eq("id",text(formData,"blackoutId")).eq("business_id",business.id);refresh(slug);}

const localDateTime=(value:string,timeZone:string)=>{
 const [date,time]=value.split("T");if(!date||!time)return null;
 const parsed=zonedDateTimeToUtc(date,time.slice(0,5),timeZone);
 return Number.isNaN(parsed.getTime())?null:parsed;
};
export async function addTechnicianTimeOff(slug:string,formData:FormData){
 const {supabase,user,business,role}=await requireWorkspaceCapability(slug,"online_booking");if(!canManageCustomers(role))redirect(`/app/${slug}/booking?error=Permission+denied`);
 const technicianId=text(formData,"technicianId"),starts=localDateTime(text(formData,"startsAt"),business.timezone),ends=localDateTime(text(formData,"endsAt"),business.timezone);
 if(!technicianId||!starts||!ends||ends<=starts)redirect(`/app/${slug}/booking?error=Enter+a+valid+technician+and+time-off+range`);
 const {data:technician}=await supabase.from("technician_profiles").select("id").eq("id",technicianId).eq("business_id",business.id).eq("is_active",true).maybeSingle();
 if(!technician)redirect(`/app/${slug}/booking?error=Technician+not+found`);
 const {error}=await supabase.from("technician_time_off").insert({business_id:business.id,technician_id:technicianId,starts_at:starts.toISOString(),ends_at:ends.toISOString(),reason:text(formData,"reason")||null,created_by:user.id});
 if(error){console.error("Technician time off insert failed",{code:error.code,businessId:business.id,technicianId});redirect(`/app/${slug}/booking?error=Time+off+could+not+be+saved`);}
 revalidatePath(`/app/${slug}/booking`);redirect(`/app/${slug}/booking?success=Technician+time+off+saved`);
}
export async function deleteTechnicianTimeOff(slug:string,formData:FormData){
 const {supabase,business,role}=await requireWorkspaceCapability(slug,"online_booking");if(!canManageCustomers(role))redirect(`/app/${slug}/booking?error=Permission+denied`);
 const {error}=await supabase.from("technician_time_off").delete().eq("id",text(formData,"timeOffId")).eq("business_id",business.id);
 if(error){console.error("Technician time off removal failed",{code:error.code,businessId:business.id});redirect(`/app/${slug}/booking?error=Time+off+could+not+be+removed`);}
 revalidatePath(`/app/${slug}/booking`);redirect(`/app/${slug}/booking?success=Technician+time+off+removed`);
}
