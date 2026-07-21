import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "inventory-images";
function authorized(request: NextRequest) {
  const expected = process.env.ADMIN_ACCESS_KEY;
  return Boolean(expected && request.headers.get("x-admin-key") === expected);
}
function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/-+/g, "-").slice(-100);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase admin access is not configured." }, { status: 500 });

  const form = await request.formData();
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  if (!files.length) return NextResponse.json({ error: "Choose at least one image." }, { status: 400 });
  if (files.length > 10) return NextResponse.json({ error: "Upload up to 10 images at a time." }, { status: 400 });

  const urls: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: `${file.name} is not an image.` }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: `${file.name} is larger than 8 MB.` }, { status: 400 });
    const path = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}-${safeName(file.name || "photo.jpg")}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    urls.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return NextResponse.json({ urls });
}
