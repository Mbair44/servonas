"use client";
import { useState, useTransition } from "react";
import { previewBookingFollowUp, sendBookingFollowUp } from "@/app/app/[businessSlug]/jobs/[jobId]/bookingFollowUpActions";
export function BookingFollowUpControls({ slug, jobId }: { slug: string; jobId: string }) {
 const [includeReview, setIncludeReview] = useState(true);
 const [preview, setPreview] = useState<{ requestId: string; phone: string; body: string } | null>(null);
 const [notice, setNotice] = useState("");
 const [pending, start] = useTransition();
 return <div className="manage-booking-controls"><strong>Balance &amp; review text</strong><label><input type="checkbox" checked={includeReview} disabled={pending} onChange={event => { setIncludeReview(event.target.checked); setPreview(null); setNotice(""); }}/>Include Google review request</label><button type="button" className="sv-button sv-secondary" disabled={pending} onClick={() => start(async () => {
  setNotice(""); setPreview(null);
  try { setPreview(await previewBookingFollowUp(slug, jobId, includeReview)); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not preview text."); }
 })}>Preview balance text</button>{preview && <div><p>To: {preview.phone}</p><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{preview.body}</p><small>Sending creates a new secure booking link and disables the previous link.</small><button type="button" className="sv-button" disabled={pending} onClick={() => start(async () => {
  setNotice("");
  try { await sendBookingFollowUp(slug, jobId, includeReview, preview); setPreview(null); setNotice("Text accepted for delivery. Check Communications for status."); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not send text."); }
 })}>{pending ? "Sending…" : "Send text"}</button></div>}{notice && <p role="status">{notice}</p>}</div>;
}
