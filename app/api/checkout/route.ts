import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {stripePaymentsReady} from "@/lib/stripeConnect";
import {verifyGooglePlace} from "@/lib/googleAddress";
import {ensureRentalBookingJob} from "@/lib/rentalBookingJob";
import {sendRentalBookingBusinessNotification,sendRentalBookingConfirmationEmail} from "@/lib/communications/rentalBookingEmailService";
import {zonedDateTimeToUtc} from "@/lib/bookingTime";
import {validateRentalPromo} from "@/lib/discounts";
import {calculateRentalDays,calculateRentalUnitPrice,resolveRentalPricingRules} from "@/lib/rentalPricing";
import {operatorCharge} from "@/lib/rentalOperators";

type RequestedItem = { inventoryItemId?: string; quantity?: number };
type RequestedOperator = { inventoryItemId?: string; selected?: boolean };
type CheckoutBody = {
  businessSlug?: string;
  items?: RequestedItem[];
  rentalDate?: string;
  rentalEndDate?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  agreementAccepted?: string | boolean;
  depositAccepted?: string | boolean;
  googlePlaceId?: string;
  promoCode?: string;
  operators?: RequestedOperator[];
};

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutBody;
    const required: Array<[keyof CheckoutBody, string]> = [
      ["rentalDate", "rental date"], ["rentalEndDate", "rental end date"], ["firstName", "first name"], ["lastName", "last name"],
      ["email", "email"], ["phone", "phone"], ["address", "delivery address"], ["city", "city"],
      ["zipCode", "ZIP code"], ["startTime", "event start time"], ["endTime", "event end time"],
    ];
    for (const [key, label] of required) {
      if (!hasText(body[key])) return NextResponse.json({ error: `Please enter your ${label}.` }, { status: 400 });
    }

    const requestedItems = Array.isArray(body.items)
      ? body.items
          .filter((item) => hasText(item.inventoryItemId) && Number.isInteger(item.quantity) && Number(item.quantity) > 0)
          .map((item) => ({ inventoryItemId: item.inventoryItemId!.trim(), quantity: Number(item.quantity) }))
      : [];
    if (requestedItems.length === 0) return NextResponse.json({ error: "Please choose at least one rental item." }, { status: 400 });
    if (new Set(requestedItems.map((item) => item.inventoryItemId)).size !== requestedItems.length) {
      return NextResponse.json({ error: "The same rental item cannot appear more than once." }, { status: 400 });
    }
    if (body.agreementAccepted !== "true" && body.agreementAccepted !== true) return NextResponse.json({ error: "Please accept the rental agreement and safety rules." }, { status: 400 });

    if(process.env.GOOGLE_MAPS_API_KEY&&process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY){
      if(!hasText(body.googlePlaceId))return NextResponse.json({error:"Select the delivery address from Google’s suggestions so it can be verified."},{status:400});
      const verified=await verifyGooglePlace(body.googlePlaceId.trim());
      if(!verified?.streetAddress||!verified.city||!verified.postalCode)return NextResponse.json({error:"The selected delivery address could not be verified. Search for it again and choose a Google suggestion."},{status:400});
      body.address=verified.streetAddress;
      body.city=verified.city;
      body.zipCode=verified.postalCode;
    }
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Booking is temporarily unavailable." }, { status: 503 });

    const {data: publicBooking}=hasText(body.businessSlug)
      ? await supabase.from("booking_settings").select("business_id,rental_deposit_percent,timezone,standard_rental_hours,allow_multi_day_rentals,additional_day_pricing_type,additional_day_discount_percent,additional_day_flat_rate_cents,max_rental_days").ilike("public_slug",body.businessSlug.trim()).eq("enabled",true).maybeSingle()
      : {data:null};
    const {data: business}=publicBooking
      ? await supabase.from("businesses").select("id,slug").eq("id",publicBooking.business_id).eq("industry_profile","party_rental").eq("is_deleted",false).maybeSingle()
      : {data:null};
    if(hasText(body.businessSlug)&&!business)return NextResponse.json({error:"This party-rental booking page is unavailable."},{status:404});
    if(business&&publicBooking){
      const weekday=new Date(`${body.rentalDate}T12:00:00Z`).getUTCDay();
      const {data:availableHours,error:hoursError}=await supabase.from("booking_availability").select("start_time,end_time").eq("business_id",business.id).eq("weekday",weekday).eq("active",true);
      if(hoursError)return NextResponse.json({error:"Business hours could not be verified. Please try again."},{status:500});
      if(!(availableHours??[]).some(row=>body.startTime!>=String(row.start_time).slice(0,5)&&body.startTime!<=String(row.end_time).slice(0,5)))return NextResponse.json({error:"Choose a rental start time within the business’s available hours."},{status:409});
      const timezone=publicBooking.timezone??"America/Phoenix";
      const requestedStartsAt=zonedDateTimeToUtc(body.rentalDate!,body.startTime!,timezone),requestedEndsAt=zonedDateTimeToUtc(body.rentalEndDate!,body.endTime!,timezone);
      if(requestedEndsAt<=requestedStartsAt)return NextResponse.json({error:"Choose a valid event start and end time."},{status:400});
      const {data:blackout,error:blackoutError}=await supabase.from("booking_blackouts").select("id").eq("business_id",business.id)
        .lt("starts_at",requestedEndsAt.toISOString()).gt("ends_at",requestedStartsAt.toISOString()).limit(1);
      if(blackoutError)return NextResponse.json({error:"The selected time could not be verified. Please try again."},{status:500});
      if(blackout?.length)return NextResponse.json({error:"That date or time is blocked by the business. Please choose another time."},{status:409});
    }
    const {data:paymentAccount}=business?await supabase.from("business_payment_accounts")
      .select("provider_account_id,onboarding_status,charges_enabled,payouts_enabled")
      .eq("business_id",business.id).eq("provider","stripe").maybeSingle():{data:null};
    const configuredDepositPercent=business?Number(publicBooking?.rental_deposit_percent??25):25;
    const depositPercent=Math.min(100,Math.max(0,Number.isFinite(configuredDepositPercent)?configuredDepositPercent:25));
    const onlinePaymentsReady=business
      ? Boolean(depositPercent>0&&stripeKey&&paymentAccount?.provider_account_id&&stripePaymentsReady(paymentAccount))
      : Boolean(stripeKey);

    const ids = requestedItems.map((item) => item.inventoryItemId);
    const { data: items, error: itemError } = await supabase
      .from("inventory_items")
      .select("id,name,daily_price_cents,active,allow_quantity,stock_quantity,standard_rental_hours_override,allow_multi_day_override,additional_day_pricing_type_override,additional_day_discount_percent_override,additional_day_flat_rate_cents_override,max_rental_days_override,operator_mode,operator_hourly_rate_cents,operator_default_selected")
      .in("id", ids)
      .match(business?{business_id:business.id}:{})
      .eq("active", true);
    if (itemError || !items || items.length !== ids.length) return NextResponse.json({ error: "One or more selected rental items are no longer available." }, { status: 404 });

    const itemsById = new Map(items.map((item) => [item.id, item]));
    const orderedItems = requestedItems.map((requested) => ({ ...itemsById.get(requested.inventoryItemId)!, quantity: requested.quantity }));
    for (const item of orderedItems) {
      if (!item.allow_quantity && item.quantity !== 1) return NextResponse.json({ error: `${item.name} can only be added once.` }, { status: 400 });
      if (item.quantity > item.stock_quantity) return NextResponse.json({ error: `Only ${item.stock_quantity} of ${item.name} are in inventory.` }, { status: 400 });
    }
    const startInstant=zonedDateTimeToUtc(body.rentalDate!,body.startTime!,publicBooking?.timezone??"America/Phoenix"),endInstant=zonedDateTimeToUtc(body.rentalEndDate!,body.endTime!,publicBooking?.timezone??"America/Phoenix");
    const businessRules={standardRentalHours:Number(publicBooking?.standard_rental_hours??24),allowMultiDay:Boolean(publicBooking?.allow_multi_day_rentals),additionalDayPricingType:(publicBooking?.additional_day_pricing_type??"full_price") as "full_price"|"percentage_discount"|"flat_rate",additionalDayDiscountPercent:Number(publicBooking?.additional_day_discount_percent??0),additionalDayFlatRateCents:publicBooking?.additional_day_flat_rate_cents==null?null:Number(publicBooking.additional_day_flat_rate_cents),maxRentalDays:publicBooking?.max_rental_days==null?null:Number(publicBooking.max_rental_days)};
    const requestedOperators=new Map((Array.isArray(body.operators)?body.operators:[]).filter(row=>hasText(row.inventoryItemId)).map(row=>[row.inventoryItemId!.trim(),row.selected===true]));
    let pricedItems;try{pricedItems=orderedItems.map(item=>{const rules=resolveRentalPricingRules(businessRules,item),days=calculateRentalDays(startInstant,endInstant,rules.standardRentalHours),price=calculateRentalUnitPrice(item.daily_price_cents,days,rules),operator=operatorCharge(item,startInstant,endInstant,item.quantity,requestedOperators.get(item.id));return {...item,...price,operator};});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"The rental period is invalid."},{status:400});}
    const authoritativeItems=pricedItems.map(item=>({id:item.id,quantity:item.quantity,unitPriceCents:item.totalUnitPriceCents+(item.operator.chargeCents/item.quantity)}));
    const promo=hasText(body.promoCode)&&business?await validateRentalPromo(supabase,{businessId:business.id,code:body.promoCode,email:body.email,items:authoritativeItems}):null;
    if(promo&&!promo.ok)return NextResponse.json({error:promo.error},{status:400});

    const { data, error: bookingError } = await supabase.rpc("create_public_booking_quantities_timed", {
      p_items: requestedItems,
      p_rental_date: body.rentalDate,
      p_rental_end_date: body.rentalEndDate,
      p_first_name: body.firstName!.trim(),
      p_last_name: body.lastName!.trim(),
      p_email: body.email!.trim(),
      p_phone: body.phone!.trim(),
      p_event_start_time: body.startTime,
      p_event_end_time: body.endTime,
      p_delivery_address: body.address!.trim(),
      p_delivery_city: body.city,
      p_delivery_zip: body.zipCode!.trim(),
      p_notes: body.notes?.trim() ?? "",
    });
    if (bookingError) {
      const message = bookingError.message || "Could not create the reservation.";
      const conflict=bookingError.code==="23505"||/one_active_(?:reservation|booking)_per_item_date/i.test(message);
      return NextResponse.json({ error: conflict?"That rental is already reserved for the selected date or time. Refresh availability and choose another option.":message }, { status: conflict||/available|reserved|blocked|inventory/i.test(message) ? 409 : 400 });
    }

    const booking = Array.isArray(data) ? data[0] : data;
    if (!booking?.booking_id) return NextResponse.json({ error: "The reservation was not created. Please try again." }, { status: 500 });

    const {data:bookingItems,error:bookingItemsError}=await supabase.from("booking_items").select("id,inventory_item_id").eq("booking_id",booking.booking_id);
    if(bookingItemsError||!bookingItems||bookingItems.length!==pricedItems.length){await supabase.from("bookings").update({status:"expired"}).eq("id",booking.booking_id);await supabase.from("booking_items").update({status:"expired"}).eq("booking_id",booking.booking_id);return NextResponse.json({error:"The reservation could not be finalized. Please try again."},{status:500});}
    const bookingItemByInventoryId=new Map(bookingItems.map(item=>[item.inventory_item_id,item.id]));
    const snapshots=await Promise.all(pricedItems.map(item=>supabase.from("booking_items").update({operator_selected:item.operator.selected,operator_mode_snapshot:item.operator.mode,operator_hourly_rate_cents:item.operator.selected?item.operator.rateCents:null,operator_billable_hours:item.operator.selected?item.operator.hours:null,operator_charge_cents:item.operator.chargeCents}).eq("id",bookingItemByInventoryId.get(item.id)!)));
    if(snapshots.some(result=>result.error)){await supabase.from("bookings").update({status:"expired"}).eq("id",booking.booking_id);await supabase.from("booking_items").update({status:"expired"}).eq("booking_id",booking.booking_id);return NextResponse.json({error:"The reservation could not be finalized. Please try again."},{status:500});}
    const operatorTotalCents=pricedItems.reduce((sum,item)=>sum+item.operator.chargeCents,0),subtotalCents=pricedItems.reduce((sum, item) => sum + item.totalUnitPriceCents * item.quantity, 0)+operatorTotalCents;
    const discountCents=promo?.ok?promo.discountCents:0,totalCents=Math.max(0,subtotalCents-discountCents);
    const depositCents = Math.round(totalCents * depositPercent / 100);
    if(onlinePaymentsReady&&depositCents>0&&body.depositAccepted!=="true"&&body.depositAccepted!==true)return NextResponse.json({error:"Please acknowledge the non-refundable deposit policy."},{status:400});
    const {data:createdBooking}=business?await supabase.from("bookings").select("customer_id").eq("id",booking.booking_id).eq("business_id",business.id).single():{data:null};
    if(promo?.ok&&business){const {error:reserveError}=await supabase.rpc("reserve_discount_redemption",{p_business_id:business.id,p_discount_id:promo.discountId,p_customer_id:createdBooking?.customer_id??null,p_booking_id:booking.booking_id,p_amount:discountCents});if(reserveError){await supabase.from("bookings").update({status:"expired"}).eq("id",booking.booking_id);await supabase.from("booking_items").update({status:"expired"}).eq("booking_id",booking.booking_id);return NextResponse.json({error:/usage_limit|customer_limit/.test(reserveError.message)?"This promo code has reached its usage limit.":"This promo code could not be reserved. Please try again."},{status:409});}}
    await supabase.from("bookings").update({subtotal_cents:subtotalCents,total_cents:totalCents,operator_total_cents:operatorTotalCents,discount_cents:discountCents,discount_id:promo?.ok?promo.discountId:null,discount_code:promo?.ok?promo.code:null,discount_name:promo?.ok?promo.name:null}).eq("id",booking.booking_id);
    if(!onlinePaymentsReady||depositCents===0){
      const {error:confirmationError}=await supabase.from("bookings").update({
        ...(business?{business_id:business.id}:{}),status:"confirmed",deposit_cents:0,
        amount_paid_cents:0,balance_due_cents:totalCents,
      }).eq("id",booking.booking_id);
      if(confirmationError)throw confirmationError;
      const {error:itemConfirmationError}=await supabase.from("booking_items").update({status:"confirmed"}).eq("booking_id",booking.booking_id);
      if(itemConfirmationError)throw itemConfirmationError;
      if(promo?.ok&&business)await supabase.rpc("finalize_discount_redemption",{p_business_id:business.id,p_booking_id:booking.booking_id});
      const jobId=await ensureRentalBookingJob(supabase,booking.booking_id);
      const emailResult=await sendRentalBookingConfirmationEmail(booking.booking_id,jobId);
      if(!emailResult.ok)console.error("Invoice-later rental confirmation email was not delivered",{bookingId:booking.booking_id,reason:emailResult.error});
      const businessEmailResult=await sendRentalBookingBusinessNotification(booking.booking_id,jobId);
      if(!businessEmailResult.ok)console.error("Invoice-later rental business notification was not delivered",{bookingId:booking.booking_id,reason:businessEmailResult.error});
      return NextResponse.json({paymentMode:"invoice_later",bookingId:booking.booking_id,bookingNumber:booking.booking_number});
    }
    const stripe = new Stripe(stripeKey!);
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: body.email!.trim(),
        payment_method_types: ["card"],
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: depositCents,
            product_data: {
              name: `${depositPercent}% Non-Refundable Rental Deposit`,
              description: `Reserves ${body.rentalDate}. Order total after Servonas promo code: ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalCents / 100)}.`,
            },
          },
        }],
        success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: business?`${siteUrl}/book/${encodeURIComponent(body.businessSlug!.trim())}`:`${siteUrl}/book?cart=${orderedItems.map((item) => `${item.id}:${item.quantity}`).join(",")}&cancelled=1`,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        metadata: {
          booking_id: String(booking.booking_id),
          ...(business?{business_id:business.id}:{}),
          booking_number: String(booking.booking_number),
          rental_date: String(body.rentalDate),
          inventory_item_ids: ids.join(","),
          item_count: String(orderedItems.reduce((sum, item) => sum + item.quantity, 0)),
          subtotal_cents:String(subtotalCents),total_cents:String(totalCents),discount_cents:String(discountCents),...(promo?.ok?{discount_id:promo.discountId,discount_code:promo.code,discount_name:promo.name}:{}),
          deposit_cents: String(depositCents),
        },
      },business?{stripeAccount:paymentAccount!.provider_account_id!}:undefined);
    } catch (stripeError) {
      await supabase.from("bookings").update({ status: "expired" }).eq("id", booking.booking_id);
      await supabase.from("booking_items").update({ status: "expired" }).eq("booking_id", booking.booking_id);
      if(promo?.ok&&business)await supabase.from("discount_redemptions").update({status:"voided"}).eq("business_id",business.id).eq("booking_id",booking.booking_id).eq("status","pending");
      throw stripeError;
    }

    await supabase.from("bookings").update({
      ...(business?{business_id:business.id}:{}),
      stripe_checkout_session_id: session.id,
      deposit_cents: depositCents,
      balance_due_cents: totalCents - depositCents,
    }).eq("id", booking.booking_id);

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: "Something went wrong while opening secure checkout." }, { status: 500 });
  }
}
