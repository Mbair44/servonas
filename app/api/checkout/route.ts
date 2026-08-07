import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {stripePaymentsReady} from "@/lib/stripeConnect";
import {verifyGooglePlace} from "@/lib/googleAddress";
import {ensureRentalBookingJob} from "@/lib/rentalBookingJob";
import {sendRentalBookingBusinessNotification,sendRentalBookingConfirmationEmail} from "@/lib/communications/rentalBookingEmailService";
import {zonedDateTimeToUtc} from "@/lib/bookingTime";

type RequestedItem = { inventoryItemId?: string; quantity?: number };
type CheckoutBody = {
  businessSlug?: string;
  items?: RequestedItem[];
  rentalDate?: string;
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
};

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutBody;
    const required: Array<[keyof CheckoutBody, string]> = [
      ["rentalDate", "rental date"], ["firstName", "first name"], ["lastName", "last name"],
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
      ? await supabase.from("booking_settings").select("business_id,rental_deposit_percent,timezone").ilike("public_slug",body.businessSlug.trim()).eq("enabled",true).maybeSingle()
      : {data:null};
    const {data: business}=publicBooking
      ? await supabase.from("businesses").select("id,slug").eq("id",publicBooking.business_id).eq("industry_profile","party_rental").eq("is_deleted",false).maybeSingle()
      : {data:null};
    if(hasText(body.businessSlug)&&!business)return NextResponse.json({error:"This party-rental booking page is unavailable."},{status:404});
    if(business&&publicBooking){
      const weekday=new Date(`${body.rentalDate}T12:00:00Z`).getUTCDay();
      const {data:availableHours,error:hoursError}=await supabase.from("booking_availability").select("start_time,end_time").eq("business_id",business.id).eq("weekday",weekday).eq("active",true);
      if(hoursError)return NextResponse.json({error:"Business hours could not be verified. Please try again."},{status:500});
      if(!(availableHours??[]).some(row=>body.startTime!>=String(row.start_time).slice(0,5)&&body.endTime!<=String(row.end_time).slice(0,5)))return NextResponse.json({error:"Choose a rental time within the business’s available hours."},{status:409});
      const timezone=publicBooking.timezone??"America/Phoenix";
      const requestedStartsAt=zonedDateTimeToUtc(body.rentalDate!,body.startTime!,timezone),requestedEndsAt=zonedDateTimeToUtc(body.rentalDate!,body.endTime!,timezone);
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
    if(onlinePaymentsReady&&body.depositAccepted!=="true"&&body.depositAccepted!==true)return NextResponse.json({error:"Please acknowledge the non-refundable deposit policy."},{status:400});

    const ids = requestedItems.map((item) => item.inventoryItemId);
    const { data: items, error: itemError } = await supabase
      .from("inventory_items")
      .select("id,name,daily_price_cents,active,allow_quantity,stock_quantity")
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

    const { data, error: bookingError } = await supabase.rpc("create_public_booking_quantities_timed", {
      p_items: requestedItems,
      p_rental_date: body.rentalDate,
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

    const totalCents = orderedItems.reduce((sum, item) => sum + item.daily_price_cents * item.quantity, 0);
    const depositCents = Math.round(totalCents * depositPercent / 100);
    if(!onlinePaymentsReady){
      const {error:confirmationError}=await supabase.from("bookings").update({
        ...(business?{business_id:business.id}:{}),status:"confirmed",deposit_cents:0,
        amount_paid_cents:0,balance_due_cents:totalCents,
      }).eq("id",booking.booking_id);
      if(confirmationError)throw confirmationError;
      const {error:itemConfirmationError}=await supabase.from("booking_items").update({status:"confirmed"}).eq("booking_id",booking.booking_id);
      if(itemConfirmationError)throw itemConfirmationError;
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
        allow_promotion_codes: true,
        line_items: orderedItems.map((item) => ({
          quantity: item.quantity,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(item.daily_price_cents * depositPercent / 100),
            product_data: {
              name: `${depositPercent}% Non-Refundable Deposit — ${item.name}`,
              description: `Reserves ${body.rentalDate}. Unit rental price: ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.daily_price_cents / 100)}.`,
            },
          },
        })),
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
          total_cents: String(totalCents),
          deposit_cents: String(depositCents),
        },
      },business?{stripeAccount:paymentAccount!.provider_account_id!}:undefined);
    } catch (stripeError) {
      await supabase.from("bookings").update({ status: "expired" }).eq("id", booking.booking_id);
      await supabase.from("booking_items").update({ status: "expired" }).eq("booking_id", booking.booking_id);
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
