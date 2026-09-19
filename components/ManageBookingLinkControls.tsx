"use client";
import { useState, useTransition } from "react";
import { manageBookingLink } from "@/app/app/[businessSlug]/jobs/[jobId]/manageBookingActions";
export function ManageBookingLinkControls({ slug, jobId, status }: { slug: string; jobId: string; status: string }) {
  const [pending, start] = useTransition(); const [notice, setNotice] = useState(""); const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const copy = () => {
    if (currentUrl) { void navigator.clipboard.writeText(currentUrl).then(() => setNotice("Manage booking link copied.")); return; }
    run(status === "Active" ? "copy" : "generate");
  };
  const run = (action: "generate" | "regenerate" | "revoke" | "copy" | "resend") => start(async () => {
    try {
      const result = await manageBookingLink(slug, jobId, action);
      if ("url" in result && result.url) {
        setCurrentUrl(result.url); await navigator.clipboard.writeText(result.url);
        setNotice(action === "copy" || action === "regenerate" ? "New manage booking link copied. The previous link is disabled." : "Manage booking link created and copied.");
      } else { setCurrentUrl(null); setNotice("Manage booking link disabled."); }
    } catch { setNotice("Could not update the manage booking link."); }
  });
  return <div className="manage-booking-controls"><p><strong>Manage booking link:</strong> {status}</p><div><button type="button" className="sv-button sv-secondary" disabled={pending} onClick={copy}>{currentUrl ? "Copy manage link" : status === "Active" ? "Copy new link" : "Generate link"}</button><button type="button" className="text-button" disabled={pending} onClick={() => run("regenerate")}>Generate new link</button><button type="button" className="text-button danger" disabled={pending || status !== "Active"} onClick={() => run("revoke")}>Disable link</button></div><small>Creating a new link disables the previous link.</small>{notice && <small role="status">{notice}</small>}</div>;
}
