import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function authorized(request: Request) {
  const configuredKey = process.env.ADMIN_ACCESS_KEY;
  const suppliedKey = request.headers.get("x-admin-key");
  return Boolean(configuredKey && suppliedKey && suppliedKey === configuredKey);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase admin access is not configured." }, { status: 503 });

  const body = await request.json() as { inventoryItemId?: string; blockedDate?: string; reason?: string };
  if (!body.inventoryItemId || !body.blockedDate) {
    return NextResponse.json({ error: "Choose an item and date." }, { status: 400 });
  }

  const { data: blockId, error: blockError } = await supabase.rpc("create_inventory_block", {
    p_inventory_item_id: body.inventoryItemId,
    p_blocked_date: body.blockedDate,
    p_reason: body.reason?.trim() || null,
  });
  if (blockError || !blockId) {
    const message = blockError?.message || "Could not block that date.";
    const conflict = /already|booking|blocked/i.test(message);
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 400 });
  }

  const { data, error } = await supabase
    .from("blocked_dates")
    .select("id,blocked_date,reason,inventory_items(name)")
    .eq("id", blockId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ blockedDate: data });
}

export async function DELETE(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase admin access is not configured." }, { status: 503 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing blocked-date ID." }, { status: 400 });
  const { error } = await supabase.from("blocked_dates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ removed: true });
}
