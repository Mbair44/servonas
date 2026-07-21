import { getSupabasePublic } from "./supabasePublic";

export type InventoryItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  daily_price_cents: number;
  image_url: string | null;
  allow_quantity: boolean;
  stock_quantity: number;
};

export async function getActiveInventory(): Promise<InventoryItem[]> {
  const supabase = getSupabasePublic();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("inventory_items")
    .select("id,name,slug,description,daily_price_cents,image_url,allow_quantity,stock_quantity")
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Could not load inventory:", error.message);
    return [];
  }

  return data ?? [];
}
