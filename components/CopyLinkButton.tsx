"use client";
import { useState } from "react";
export default function CopyLinkButton({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied,setCopied]=useState(false);
  async function copy(){try{await navigator.clipboard.writeText(url);setCopied(true);window.setTimeout(()=>setCopied(false),1800);}catch{window.prompt("Copy this link:",url);}}
  return <button type="button" className="sv-button sv-secondary" onClick={copy}>{copied?"Copied":label}</button>;
}
