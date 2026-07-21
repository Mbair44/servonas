import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type RequestedItem = { inventoryItemId?: string; quantity?: number };
type CheckoutBody = {
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
    if (body.depositAccepted !== "true" && body.depositAccepted !== true) return NextResponse.json({ error: "Please acknowledge the non-refundable deposit policy." }, { status: 400 });

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const supabase = getSupabaseAdmin();
    if (!stripeKey || !supabase) return NextResponse.json({ error: "Stripe or Supabase is not configured." }, { status: 503 });

    const ids = requestedItems.map((item) => item.inventoryItemId);
    const { data: items, error: itemError } = await supabase
      .from("inventory_items")
      .select("id,name,daily_price_cents,active,allow_quantity,stock_quantity")
      .in("id", ids)
      .eq("active", true);
    if (itemError || !items || items.length !== ids.length) return NextResponse.json({ error: "One or more selected rental items are no longer available." }, { status: 404 });

    const itemsById = new Map(items.map((item) => [item.id, item]));
    const orderedItems = requestedItems.map((requested) => ({ ...itemsById.get(requested.inventoryItemId)!, quantity: requested.quantity }));
    for (const item of orderedItems) {
      if (!item.allow_quantity && item.quantity !== 1) return NextResponse.json({ error: `${item.name} can only be added once.` }, { status: 400 });
      if (item.quantity > item.stock_quantity) return NextResponse.json({ error: `Only ${item.stock_quantity} of ${item.name} are in inventory.` }, { status: 400 });
    }

    const { data, error: bookingError } = await supabase.rpc("create_public_booking_quantities", {
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
      return NextResponse.json({ error: message }, { status: /available|reserved|blocked|inventory/i.test(message) ? 409 : 400 });
    }

    const booking = Array.isArray(data) ? data[0] : data;
    if (!booking?.booking_id) return NextResponse.json({ error: "The reservation was not created. Please try again." }, { status: 500 });

    const totalCents = orderedItems.reduce((sum, item) => sum + item.daily_price_cents * item.quantity, 0);
    const depositCents = Math.round(totalCents * 0.25);
    const stripe = new Stripe(stripeKey);
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
            unit_amount: Math.round(item.daily_price_cents * 0.25),
            product_data: {
              name: `25% Non-Refundable Deposit — ${item.name}`,
              description: `Reserves ${body.rentalDate}. Unit rental price: ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.daily_price_cents / 100)}.`,
            },
          },
        })),
        success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/book?cart=${orderedItems.map((item) => `${item.id}:${item.quantity}`).join(",")}&cancelled=1`,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        metadata: {
          booking_id: String(booking.booking_id),
          booking_number: String(booking.booking_number),
          rental_date: String(body.rentalDate),
          inventory_item_ids: ids.join(","),
          item_count: String(orderedItems.reduce((sum, item) => sum + item.quantity, 0)),
          total_cents: String(totalCents),
          deposit_cents: String(depositCents),
        },
      });
    } catch (stripeError) {
      await supabase.from("bookings").update({ status: "expired" }).eq("id", booking.booking_id);
      await supabase.from("booking_items").update({ status: "expired" }).eq("booking_id", booking.booking_id);
      throw stripeError;
    }

    await supabase.from("bookings").update({
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
