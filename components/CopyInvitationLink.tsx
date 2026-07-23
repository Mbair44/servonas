"use client";

import { useState } from "react";

export default function CopyInvitationLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this invitation link:", url);
    }
  }
  return <button className="text-button" type="button" onClick={copy}>{copied ? "Copied" : "Copy invitation link"}</button>;
}
