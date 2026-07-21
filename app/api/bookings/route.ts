import { NextResponse } from "next/server";
import { getSupabasePublic } from "@/lib/supabasePublic";

type BookingRequest = {
  inventoryItemId?: string;
  rentalDate?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  startTime?: string;
  endTime?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  notes?: string;
  agreementAccepted?: string | boolean;
};

function requiredText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BookingRequest;
    const requiredFields: Array<[keyof BookingRequest, string]> = [
      ["inventoryItemId", "rental item"],
      ["rentalDate", "rental date"],
      ["firstName", "first name"],
      ["lastName", "last name"],
      ["email", "email"],
      ["phone", "phone"],
      ["startTime", "event start time"],
      ["endTime", "event end time"],
      ["address", "delivery address"],
      ["city", "delivery city"],
      ["zipCode", "ZIP code"],
    ];

    for (const [key, label] of requiredFields) {
      if (!requiredText(body[key])) {
        return NextResponse.json({ error: `Please enter your ${label}.` }, { status: 400 });
      }
    }

    if (body.agreementAccepted !== "true" && body.agreementAccepted !== true) {
      return NextResponse.json(
        { error: "Please accept the rental agreement and safety rules." },
        { status: 400 },
      );
    }

    const supabase = getSupabasePublic();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase is not configured. Check your .env.local file." },
        { status: 503 },
      );
    }

    const { data, error } = await supabase.rpc("create_public_booking", {
      p_inventory_item_id: body.inventoryItemId,
      p_rental_date: body.rentalDate,
      p_first_name: body.firstName?.trim(),
      p_last_name: body.lastName?.trim(),
      p_email: body.email?.trim(),
      p_phone: body.phone?.trim(),
      p_event_start_time: body.startTime,
      p_event_end_time: body.endTime,
      p_delivery_address: body.address?.trim(),
      p_delivery_city: body.city,
      p_delivery_zip: body.zipCode?.trim(),
      p_notes: body.notes?.trim() ?? "",
    });

    if (error) {
      const message = error.message || "Could not create the reservation.";
      const conflict = /already|reserved|unavailable/i.test(message);
      return NextResponse.json({ error: message }, { status: conflict ? 409 : 400 });
    }

    const booking = Array.isArray(data) ? data[0] : data;
    if (!booking?.booking_number) {
      return NextResponse.json(
        { error: "The reservation was not created. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      bookingId: booking.booking_id,
      bookingNumber: booking.booking_number,
    });
  } catch (error) {
    console.error("Booking request failed:", error);
    return NextResponse.json(
      { error: "Something went wrong while creating the reservation." },
      { status: 500 },
    );
  }
}
