import { getSupabasePublic } from "./supabasePublic";

export type CapacityUsage = {
  rental_date: string;
  reserved_quantity: number;
  available_quantity: number;
  is_blocked: boolean;
};

export async function getInventoryCapacityUsage(
  inventoryItemId: string,
  startDate: string,
  endDate: string
): Promise<CapacityUsage[]> {
  const supabase = getSupabasePublic();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("get_inventory_capacity_usage", {
    p_inventory_item_id: inventoryItemId,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) {
    console.error("Could not load inventory capacity:", error.message);
    return [];
  }

  return (data ?? []) as CapacityUsage[];
}
