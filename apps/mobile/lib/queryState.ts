type MobileQueryClient = {
  clear: () => void;
  invalidateQueries: (filters: { queryKey: readonly unknown[] }) => Promise<unknown>;
  removeQueries: (filters: { queryKey: readonly unknown[] }) => void;
};

export const mobileMeQueryKey = (userId?: string) => ["me", userId] as const;

export function clearForAccountChange(client: Pick<MobileQueryClient, "clear">) {
  client.clear();
}

export function clearForWorkspaceChange(client: Pick<MobileQueryClient, "removeQueries">) {
  // Tenant-scoped data must never survive a workspace switch.
  client.removeQueries({ queryKey: ["tenant"] });
}

export async function refreshAuthorizedWorkspaces(client: Pick<MobileQueryClient, "invalidateQueries">, userId: string) {
  await client.invalidateQueries({ queryKey: mobileMeQueryKey(userId) });
}
