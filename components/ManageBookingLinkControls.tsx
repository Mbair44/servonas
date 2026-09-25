"use client";
import { useState, useTransition } from "react";
import { manageBookingLink, sendRentalDepositPaymentRequest } from "@/app/app/[businessSlug]/jobs/[jobId]/manageBookingActions";
type SessionOption={id:string;label:string;recoveredFromBookingId?:string|null};
export function ManageBookingLinkControls({ slug, jobId, status, recentSessions=[] }: { slug: string; jobId: string; status: string; recentSessions?:SessionOption[] }) {
  const [pending, start] = useTransition(); const [notice, setNotice] = useState(""); const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [attribution, setAttribution] = useState(recentSessions[0]?.id ? `session:${recentSessions[0].id}` : "");
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
  const paymentRequest = () => start(async () => {
    try {
      const selected=attribution.startsWith("session:")?recentSessions.find(item=>item.id===attribution.slice(8)):null;
      const manual=attribution.startsWith("manual:")?attribution.slice(7) as "meta_ads"|"google_ads"|"google_business_profile"|"organic"|"organic_social"|"referral"|"direct"|"unknown":null;
      const result = await sendRentalDepositPaymentRequest(slug, jobId,selected?{kind:"tracked",sessionId:selected.id,recoveredFromBookingId:selected.recoveredFromBookingId??null}:manual?{kind:"manual",source:manual}:undefined);
      setCurrentUrl(result.url);
      const masked = result.phone ? `***-***-${result.phone.replace(/\D/g, "").slice(-4)}` : "the customer";
      const smsNotice=result.smsAccepted?`Text sent to ${masked}.`:result.smsStatus==="failed"?`Text failed — ${result.smsFailureReason||"please try again."}`:`Text not sent — ${result.smsFailureReason||"no valid SMS consent."}`;
      setNotice(`Payment link created. Booking held until ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.expiresAt))}. ${smsNotice}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not create the payment request."); }
  });
  return <div className="manage-booking-controls"><p><strong>Manage booking link:</strong> {status}</p><label>Marketing source / attribution<select value={attribution} onChange={event=>setAttribution(event.target.value)}><option value="">Other / Unknown</option>{recentSessions.length>0&&<optgroup label="Recent customer activity">{recentSessions.map(item=><option key={item.id} value={`session:${item.id}`}>{item.label}</option>)}</optgroup>}<optgroup label="Customer reported"><option value="manual:meta_ads">Meta Ads</option><option value="manual:google_ads">Google Ads</option><option value="manual:google_business_profile">Google Business Profile</option><option value="manual:organic">Organic Search</option><option value="manual:organic_social">Organic Social</option><option value="manual:referral">Referral</option><option value="manual:direct">Direct</option></optgroup></select></label><div><button type="button" className="sv-button" disabled={pending} onClick={paymentRequest}>Create booking &amp; send payment request</button>{currentUrl && <button type="button" className="sv-button sv-secondary" disabled={pending} onClick={copy}>Copy payment link</button>}<button type="button" className="text-button" disabled={pending} onClick={paymentRequest}>Resend text</button></div><small>The customer enters payment details securely with Stripe. Staff never see card information.</small>{notice && <small role="status">{notice}</small>}</div>;
}
