export type GoogleAdsDiscoveredCustomer = {
 id: string;
 label: string;
 loginCustomerId: string | null;
 managerCustomerId: string | null;
 isManager: boolean;
 level: number | null;
 status: string | null;
 source: "direct" | "manager_hierarchy";
};

function selectableAdvertiser(customer: GoogleAdsDiscoveredCustomer) {
 return !customer.isManager && customer.status !== "REMOVED" && customer.status !== "CANCELED";
}

export function mergeGoogleAdsSelectableCustomers(
 rootCustomers: GoogleAdsDiscoveredCustomer[],
 hierarchyByManager: Record<string, GoogleAdsDiscoveredCustomer[]>,
) {
 const discoveredManagerAccounts = rootCustomers.filter((customer) => customer.isManager);
 const selectableCustomers = new Map<string, GoogleAdsDiscoveredCustomer>();
 for (const rootCustomer of rootCustomers) {
  if (rootCustomer.isManager) {
   for (const child of hierarchyByManager[rootCustomer.id] ?? []) {
    if (!selectableAdvertiser(child)) continue;
    if (!selectableCustomers.has(child.id)) {
     selectableCustomers.set(child.id, {
      ...child,
      loginCustomerId: rootCustomer.id,
      managerCustomerId: rootCustomer.id,
      source: "manager_hierarchy",
     });
    }
   }
   continue;
  }
  if (!selectableAdvertiser(rootCustomer)) continue;
  selectableCustomers.set(rootCustomer.id, {
   ...rootCustomer,
   loginCustomerId: null,
   managerCustomerId: null,
   source: "direct",
  });
 }
 return {
  discoveredManagerAccounts,
  selectableCustomers: [...selectableCustomers.values()].sort((a, b) => a.label.localeCompare(b.label)),
 };
}
