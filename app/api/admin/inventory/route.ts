import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function authorized(request: NextRequest) {
  const expected = process.env.ADMIN_ACCESS_KEY;
  const provided = request.headers.get("x-admin-key");
  return Boolean(expected && provided && provided === expected);
}

function cleanText(value: unknown, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function parsePriceCents(value: unknown) {
  const dollars = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(dollars) || dollars < 0 || dollars > 100000) return null;
  return Math.round(dollars * 100);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin access is not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const name = cleanText(body.name, 120);
  const description = cleanText(body.description, 2000) || null;
  const imageUrl = cleanText(body.imageUrl, 1000) || null;
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.map((value: unknown) => cleanText(value, 1000)).filter(Boolean).slice(0, 20) : [];
  const priceCents = parsePriceCents(body.priceDollars);
  const active = body.active !== false;
  const allowQuantity = body.allowQuantity === true;
  const stockQuantity = Number(body.stockQuantity);

  if (!name) {
    return NextResponse.json({ error: "Inventory name is required." }, { status: 400 });
  }
  if (priceCents === null) {
    return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });
  }
  if (!Number.isInteger(stockQuantity) || stockQuantity < 1 || stockQuantity > 10000) {
    return NextResponse.json({ error: "Inventory quantity must be a whole number between 1 and 10,000." }, { status: 400 });
  }

  const baseSlug = slugify(name) || `item-${Date.now()}`;
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const { data: existing, error: lookupError } = await supabase
      .from("inventory_items")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }
    if (!existing) break;
    slug = `${baseSlug}-${suffix++}`;
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      name,
      slug,
      description,
      image_url: imageUrl,
      image_urls: imageUrls,
      daily_price_cents: priceCents,
      active,
      allow_quantity: allowQuantity,
      stock_quantity: stockQuantity,
    })
    .select("id,name,slug,description,daily_price_cents,image_url,image_urls,active,allow_quantity,stock_quantity,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ item: data });
}

export async function PATCH(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin access is not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const id = cleanText(body.id, 100);
  const name = cleanText(body.name, 120);
  const description = cleanText(body.description, 2000) || null;
  const imageUrl = cleanText(body.imageUrl, 1000) || null;
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.map((value: unknown) => cleanText(value, 1000)).filter(Boolean).slice(0, 20) : [];
  const priceCents = parsePriceCents(body.priceDollars);
  const active = Boolean(body.active);
  const allowQuantity = body.allowQuantity === true;
  const stockQuantity = Number(body.stockQuantity);

  if (!id || !name) {
    return NextResponse.json({ error: "Inventory item and name are required." }, { status: 400 });
  }
  if (priceCents === null) {
    return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });
  }
  if (!Number.isInteger(stockQuantity) || stockQuantity < 1 || stockQuantity > 10000) {
    return NextResponse.json({ error: "Inventory quantity must be a whole number between 1 and 10,000." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .update({
      name,
      description,
      image_url: imageUrl,
      image_urls: imageUrls,
      daily_price_cents: priceCents,
      active,
      allow_quantity: allowQuantity,
      stock_quantity: stockQuantity,
    })
    .eq("id", id)
    .select("id,name,slug,description,daily_price_cents,image_url,image_urls,active,allow_quantity,stock_quantity,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase admin access is not configured." }, { status: 500 });
  }

  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Inventory item is required." }, { status: 400 });
  }

  const { count, error: countError } = await supabase
    .from("booking_items")
    .select("id", { count: "exact", head: true })
    .eq("inventory_item_id", id);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  if ((count ?? 0) > 0) {
    const { error: archiveError } = await supabase
      .from("inventory_items")
      .update({ active: false })
      .eq("id", id);

    if (archiveError) {
      return NextResponse.json({ error: archiveError.message }, { status: 400 });
    }

    return NextResponse.json({
      deleted: false,
      archived: true,
      message: "This item has booking history, so it was safely deactivated instead of permanently deleted.",
    });
  }

  const { error: blocksError } = await supabase
    .from("blocked_dates")
    .delete()
    .eq("inventory_item_id", id);

  if (blocksError) {
    return NextResponse.json({ error: blocksError.message }, { status: 400 });
  }

  const { error } = await supabase.from("inventory_items").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ deleted: true, archived: false });
}
