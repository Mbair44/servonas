"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncResponse = {
  rowsSynced?: number;
  status?: string;
  error?: string;
};

export function MetaAdsSyncButton({ businessSlug, disabled }: { businessSlug: string; disabled: boolean }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const sync = async () => {
    if (syncing || disabled) return;
    setSyncing(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/meta-ads/sync/${encodeURIComponent(businessSlug)}`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const result = await response.json().catch(() => ({})) as SyncResponse;
      if (!response.ok) throw new Error(result.error || "Meta Ads could not be synced. Please try again.");
      const rowsSynced = Number(result.rowsSynced ?? 0);
      setNotice({ kind: "success", message: `Sync complete - ${rowsSynced} row${rowsSynced === 1 ? "" : "s"} updated.` });
      router.refresh();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "Meta Ads could not be synced. Please try again." });
    } finally {
      setSyncing(false);
    }
  };

  return <div className="meta-ads-sync-control">
    <button type="button" className="sv-button sv-secondary" disabled={disabled || syncing} onClick={sync} aria-busy={syncing}>
      {syncing ? "Syncing..." : "Sync now"}
    </button>
    {notice && <span className={`workspace-notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>{notice.message}</span>}
  </div>;
}
