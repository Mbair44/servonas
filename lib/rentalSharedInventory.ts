export type RentalInventoryRequirement = {
  inventoryItemId: string;
  quantityRequired: number;
};

export type RentalListingWithRequirements = {
  id: string;
  name: string;
  required_inventory?: RentalInventoryRequirement[];
};

export const requirementsForListing = (listing: RentalListingWithRequirements): RentalInventoryRequirement[] =>
  listing.required_inventory?.length
    ? listing.required_inventory
    : [{ inventoryItemId: listing.id, quantityRequired: 1 }];

export function sharedInventoryCartConflict(
  listings: RentalListingWithRequirements[],
  quantities: Record<string, number>,
) {
  const claimedBy = new Map<string, RentalListingWithRequirements>();
  for (const listing of listings) {
    if ((quantities[listing.id] ?? 0) <= 0) continue;
    for (const requirement of requirementsForListing(listing)) {
      const existing = claimedBy.get(requirement.inventoryItemId);
      if (existing && existing.id !== listing.id) return { first: existing, second: listing };
      claimedBy.set(requirement.inventoryItemId, listing);
    }
  }
  return null;
}

export function availableListingQuantity(
  listing: RentalListingWithRequirements,
  availableByResource: Record<string, number>,
) {
  return Math.max(0, Math.min(...requirementsForListing(listing).map((requirement) =>
    Math.floor(Math.max(0, Number(availableByResource[requirement.inventoryItemId] ?? 0)) / Math.max(1, requirement.quantityRequired)),
  )));
}

export const sharedInventoryConflictMessage =
  "These rentals use some of the same equipment. Please choose either the combo or the individual item.";
