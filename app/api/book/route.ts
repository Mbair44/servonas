import { NextResponse } from "next/server";
import { getSupabasePublic } from "@/lib/supabasePublic";

const REQUIRED_FIELDS = [
  "inventoryItemId",
  "rentalDate",
  "firstName",
  "lastName",
  "email",
  "phone",
  "startTime",
  "endTime",
  "address",
  "city",
  "zipCode",
] as const;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    for (const field of REQUIRED_FIELDS) {
      if (typeof body[field] !== "string" || !body[field].trim()) {
        return NextResponse.json({ error: `Missing ${field}.` }, { status: 400 });
      }
    }

    if (body.agreementAccepted !== "true") {
      return NextResponse.json(
        { error: "You must accept the rental agreement and safety rules." },
        { status: 400 }
      );
    }

    const supabase = getSupabasePublic();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase is not configured in .env.local." },
        { status: 503 }
      );
    }

    const { data, error } = await supabase.rpc("create_public_booking", {
      p_inventory_item_id: body.inventoryItemId,
      p_rental_date: body.rentalDate,
      p_first_name: body.firstName.trim(),
      p_last_name: body.lastName.trim(),
      p_email: body.email.trim().toLowerCase(),
      p_phone: body.phone.trim(),
      p_event_start_time: body.startTime,
      p_event_end_time: body.endTime,
      p_delivery_address: body.address.trim(),
      p_delivery_city: body.city,
      p_delivery_zip: body.zipCode.trim(),
      p_notes: typeof body.notes === "string" ? body.notes.trim() : "",
    });

    if (error) {
      const message = error.message || "Could not create the reservation.";
      const conflict =
        message.toLowerCase().includes("unavailable") ||
        message.toLowerCase().includes("already reserved");

      return NextResponse.json(
        { error: message },
        { status: conflict ? 409 : 400 }
      );
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.booking_number) {
      return NextResponse.json(
        { error: "The reservation was created, but no confirmation number was returned." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      bookingNumber: result.booking_number,
      bookingId: result.booking_id,
    });
  } catch (error) {
    console.error("Booking API error:", error);
    return NextResponse.json(
      { error: "Unexpected booking error. Please try again." },
      { status: 500 }
    );
  }
}
