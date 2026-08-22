import {unstable_cache} from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getInventoryCapacityUsage } from "@/lib/bookings";
import {stripePaymentsReady} from "@/lib/stripeConnect";
import {addDays, dateInTimeZone, zonedDateTimeToUtc} from "@/lib/bookingTime";

export const loadPublicBookingData=unstable_cache(async(businessSlug:string)=>{
  const supabase=getSupabaseAdmin();
  if(!supabase)return null;
  const { data: settings } = await supabase
    .from("booking_settings")
    .select("business_id,enabled,logo_path,logo_url,brand_color,welcome_message,collect_address,intake_questions,maximum_days_ahead,timezone,rental_duration_minutes,standard_rental_hours,allow_multi_day_rentals,additional_day_pricing_type,additional_day_discount_percent,additional_day_flat_rate_cents,max_rental_days,rental_deposit_percent,businesses(name,website_url)")
    .ilike("public_slug", businessSlug)
    .eq("enabled", true)
    .maybeSingle();
  if (!settings) return null;
  const [{ data: services }, { data: hours }, {data: businessProfile}] = await Promise.all([
    supabase
      .from("services")
      .select("id,name,description,duration_minutes,price_amount,price_label")
      .eq("business_id", settings.business_id)
      .eq("active", true)
      .eq("is_deleted", false)
      .order("sort_order")
      .order("name"),
    supabase
      .from("booking_availability")
      .select("weekday,start_time,end_time")
      .eq("business_id", settings.business_id)
      .eq("active", true),
    supabase.from("businesses").select("industry_profile").eq("id", settings.business_id).maybeSingle(),
  ]);

  const schedule = Object.fromEntries(
    (hours ?? []).map((hour: any) => [
      hour.weekday,
      { start: hour.start_time.slice(0, 5), end: hour.end_time.slice(0, 5) },
    ]),
  );
  const businessRelation=settings.businesses as {name?:string;website_url?:string|null}|{name?:string;website_url?:string|null}[]|null|undefined;
  const businessRecord=Array.isArray(businessRelation)?businessRelation[0]:businessRelation;
  const businessName = businessRecord?.name;
  const { data: signedLogo } = settings.logo_path
    ? await supabase.storage.from("booking-branding").createSignedUrl(settings.logo_path, 3600)
    : { data: null };
  const bookingLogo = signedLogo?.signedUrl ?? settings.logo_url ?? null;

  const isPartyRental = businessProfile?.industry_profile === "party_rental";
  let rentalInventory: any[] = [];
  let rentalCapacity: Record<string, Record<string, number>> = {};
  let rentalUpsells: Record<string,string[]> = {};
  let rentalOnlinePaymentsReady = false;
  const rentalBlockedDates: string[] = [];
  if (isPartyRental) {
    const {data:paymentAccount}=await supabase.from("business_payment_accounts")
      .select("onboarding_status,charges_enabled,payouts_enabled")
      .eq("business_id",settings.business_id).eq("provider","stripe").maybeSingle();
    rentalOnlinePaymentsReady=stripePaymentsReady(paymentAccount??{});
    const [{data},{data:rentalCategories},{data:upsells}]=await Promise.all([
      supabase.from("inventory_items").select("id,name,category,category_id,description,daily_price_cents,image_url,allow_quantity,stock_quantity,standard_rental_hours_override,allow_multi_day_override,additional_day_pricing_type_override,additional_day_discount_percent_override,additional_day_flat_rate_cents_override,max_rental_days_override,operator_mode,operator_hourly_rate_cents,operator_default_selected").eq("business_id", settings.business_id).eq("active", true),
      supabase.from("rental_inventory_categories").select("id,name,sort_order").eq("business_id",settings.business_id).order("sort_order").order("name"),
      supabase.from("rental_item_upsells").select("source_item_id,suggested_item_id,sort_order").eq("business_id",settings.business_id).order("sort_order"),
    ]);
    const categoryOrder=new Map((rentalCategories??[]).map((row,index)=>[row.id,{rank:index,name:row.name}]));
    rentalInventory=(data??[]).sort((left,right)=>{const a=categoryOrder.get(left.category_id)??{rank:Number.MAX_SAFE_INTEGER,name:left.category||"Other rentals"},b=categoryOrder.get(right.category_id)??{rank:Number.MAX_SAFE_INTEGER,name:right.category||"Other rentals"};return a.rank-b.rank||a.name.localeCompare(b.name)||left.name.localeCompare(right.name);});
    rentalUpsells=(upsells??[]).reduce((map:Record<string,string[]>,row)=>{(map[row.source_item_id]??=[]).push(row.suggested_item_id);return map;},{});
    const start = new Date(); start.setDate(1);
    const end = new Date(start.getFullYear(), start.getMonth() + 13, 0);
    const iso = (value: Date) => value.toISOString().slice(0, 10);
    rentalCapacity = Object.fromEntries(await Promise.all(rentalInventory.map(async (item) => {
      const rows = await getInventoryCapacityUsage(item.id, iso(start), iso(end));
      return [item.id, Object.fromEntries(rows.filter((row) => row.is_blocked).map((row) => [row.rental_date, 0]))];
    })));
    const timezone=settings.timezone??"America/Phoenix";
    const firstDate=dateInTimeZone(new Date(),timezone),lastDate=iso(end);
    const {data:blackouts}=await supabase.from("booking_blackouts").select("starts_at,ends_at")
      .eq("business_id",settings.business_id)
      .lt("starts_at",zonedDateTimeToUtc(addDays(lastDate,1),"00:00",timezone).toISOString())
      .gt("ends_at",zonedDateTimeToUtc(firstDate,"00:00",timezone).toISOString());
    const blackoutWindows=(blackouts??[]).map(row=>({start:new Date(row.starts_at).getTime(),end:new Date(row.ends_at).getTime()}));
    for(let value=firstDate;value<=lastDate;value=addDays(value,1)){
      const dayStart=zonedDateTimeToUtc(value,"00:00",timezone).getTime(),dayEnd=zonedDateTimeToUtc(addDays(value,1),"00:00",timezone).getTime();
      const coveredByBusiness=blackoutWindows.some(window=>window.start<=dayStart&&window.end>=dayEnd);
      const everyItemBlocked=rentalInventory.length>0&&rentalInventory.every(item=>rentalCapacity[item.id]?.[value]===0);
      if(coveredByBusiness||everyItemBlocked)rentalBlockedDates.push(value);
    }
  }
  return {settings,services:services??[],schedule,businessName,bookingLogo,isPartyRental,rentalInventory,rentalCapacity,rentalUpsells,rentalOnlinePaymentsReady,rentalBlockedDates};
},["public-booking-page"],{revalidate:300});
