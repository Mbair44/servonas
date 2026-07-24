import { notFound } from "next/navigation";
import PrintButton from "@/components/PrintButton";
import { formatCents } from "@/lib/financial/priceBook";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { publicDocumentTokenHash, validPublicDocumentToken } from "@/lib/publicDocumentToken";
import { dateInTimeZone } from "@/lib/bookingTime";
import { acceptEstimate,declineEstimate } from "./actions";

export const dynamic="force-dynamic";
export default async function PublicEstimate({params,searchParams}:{params:Promise<{token:string}>;searchParams:Promise<{success?:string;error?:string}>}){
  const {token}=await params;const q=await searchParams;if(!validPublicDocumentToken(token))notFound();
  const supabase=getSupabaseAdmin();if(!supabase)throw new Error("Public estimate service is unavailable.");
  const hash=await publicDocumentTokenHash(token);
  const {data:estimate,error}=await supabase.from("estimates").select("*,businesses(name,timezone),customers!estimates_customer_fk(first_name,last_name,company_name,email),service_locations!estimates_location_fk(location_name,street_address,city,state,postal_code)")
    .eq("public_token_hash",hash).eq("is_deleted",false).maybeSingle();
  if(error){console.error("Public estimate lookup failed",{code:error.code});throw new Error("The estimate could not be loaded.");}
  if(!estimate)notFound();
  const business=Array.isArray(estimate.businesses)?estimate.businesses[0]:estimate.businesses;
  const customer=Array.isArray(estimate.customers)?estimate.customers[0]:estimate.customers;
  const location=Array.isArray(estimate.service_locations)?estimate.service_locations[0]:estimate.service_locations;
  const [{data:lines,error:linesError},{data:fees,error:feesError},{data:settings}] = await Promise.all([
    supabase.from("estimate_line_items").select("id,name_snapshot,description_snapshot,quantity,unit_type_snapshot,unit_price_cents,line_discount_cents,tax_amount_cents,line_total_cents").eq("estimate_id",estimate.id).eq("business_id",estimate.business_id).order("sort_order"),
    supabase.from("estimate_fees").select("id,name_snapshot,amount_cents").eq("estimate_id",estimate.id).eq("business_id",estimate.business_id).order("sort_order"),
    supabase.from("booking_settings").select("brand_color,logo_path,logo_url").eq("business_id",estimate.business_id).maybeSingle(),
  ]);
  if(linesError||feesError){console.error("Public estimate detail lookup failed",{linesCode:linesError?.code,feesCode:feesError?.code,estimateId:estimate.id});throw new Error("The estimate details could not be loaded.");}
  const today=dateInTimeZone(new Date(),business?.timezone||"UTC");
  const expired=Boolean(estimate.public_token_revoked_at||(estimate.public_token_expires_at&&new Date(estimate.public_token_expires_at)<=new Date())||(estimate.expiration_date&&estimate.expiration_date<today)||estimate.status==="expired");
  const closed=expired||!["sent","viewed"].includes(estimate.status);
  if(estimate.status==="sent"&&!expired){
    await supabase.from("estimates").update({status:"viewed",viewed_at:estimate.viewed_at||new Date().toISOString()}).eq("id",estimate.id).eq("status","sent");
    await supabase.from("estimate_events").insert({business_id:estimate.business_id,estimate_id:estimate.id,event_type:"viewed"});
  }
  await supabase.from("estimate_events").insert({business_id:estimate.business_id,estimate_id:estimate.id,event_type:"public_link_accessed"});
  const {data:signedLogo}=settings?.logo_path?await supabase.storage.from("booking-branding").createSignedUrl(settings.logo_path,3600):{data:null};
  const logo=signedLogo?.signedUrl??settings?.logo_url??null;
  return <main className="public-estimate" style={{"--estimate-brand":settings?.brand_color||"#4f46e5"} as React.CSSProperties}><section className="public-estimate-document">
    <header><div>{logo?<img src={logo} alt={`${business?.name||"Business"} logo`}/>:<span className="public-estimate-mark">{business?.name?.slice(0,1)||"S"}</span>}<div><strong>{business?.name}</strong><small>Estimate {estimate.estimate_number}</small></div></div><PrintButton/></header>
    {q.error&&<div className="public-estimate-notice error" role="alert">{q.error}</div>}{q.success&&<div className="public-estimate-notice success" role="status">{q.success}</div>}
    <div className="public-estimate-title"><span className={`estimate-status ${estimate.status}`}>{expired?"expired":estimate.status}</span><h1>{estimate.title}</h1><p>{estimate.customer_message||"Please review the estimate details below."}</p></div>
    <section className="public-estimate-parties"><div><span>Prepared for</span><strong>{customer?.company_name||`${customer?.first_name??""} ${customer?.last_name??""}`}</strong><small>{customer?.email}</small>{location&&<small>{location.location_name} · {location.street_address}, {location.city}, {location.state} {location.postal_code}</small>}</div><div><span>Estimate details</span><strong>Version {estimate.version_number}</strong><small>Issued {estimate.issue_date||"Not specified"}</small><small>Expires {estimate.expiration_date||"No expiration"}</small></div></section>
    <section className="public-estimate-lines" aria-label="Estimate line items"><div className="head"><span>Description</span><span>Quantity</span><span>Unit price</span><span>Total</span></div>{(lines??[]).map(line=><div key={line.id}><span><strong>{line.name_snapshot}</strong>{line.description_snapshot&&<small>{line.description_snapshot}</small>}</span><span>{line.quantity} {line.unit_type_snapshot.replaceAll("_"," ")}</span><span>{formatCents(line.unit_price_cents,estimate.currency)}</span><span>{formatCents(line.line_total_cents,estimate.currency)}</span></div>)}</section>
    <dl className="public-estimate-totals"><div><dt>Subtotal</dt><dd>{formatCents(estimate.subtotal_cents,estimate.currency)}</dd></div>{estimate.discount_total_cents>0&&<div><dt>Discount</dt><dd>−{formatCents(estimate.discount_total_cents,estimate.currency)}</dd></div>}<div><dt>Tax</dt><dd>{formatCents(estimate.tax_total_cents,estimate.currency)}</dd></div>{(fees??[]).map(fee=><div key={fee.id}><dt>{fee.name_snapshot}</dt><dd>{formatCents(fee.amount_cents,estimate.currency)}</dd></div>)}<div className="total"><dt>Total</dt><dd>{formatCents(estimate.grand_total_cents,estimate.currency)}</dd></div>{estimate.deposit_required_cents>0&&<div><dt>Required deposit</dt><dd>{formatCents(estimate.deposit_required_cents,estimate.currency)}</dd></div>}</dl>
    {closed?<section className="public-estimate-closed"><strong>{expired?"This estimate has expired.":estimate.status==="accepted"?"This estimate has been accepted.":estimate.status==="declined"?"This estimate was declined.":"This estimate is no longer open for response."}</strong><p>Contact {business?.name} if you need an updated estimate.</p></section>:<section className="public-estimate-response"><div><h2>Approve estimate</h2><p>Confirm that you approve version {estimate.version_number} of this estimate.</p><form action={acceptEstimate.bind(null,token)}><label>Your name<input required name="name" maxLength={160}/></label><label>Email address<input required name="email" type="email"/></label><label>Message (optional)<textarea name="message" rows={3} maxLength={2000}/></label><label className="public-estimate-check"><input required type="checkbox" name="acknowledgment"/><span>I approve the scope and pricing shown in this estimate.</span></label><button>Accept estimate</button></form></div><div><h2>Decline</h2><p>Let the business know if this estimate is not the right fit.</p><form action={declineEstimate.bind(null,token)}><label>Your name<input required name="name" maxLength={160}/></label><label>Email address<input required name="email" type="email"/></label><label>Reason or message (optional)<textarea name="reason" rows={3} maxLength={2000}/></label><button className="decline">Decline estimate</button></form></div></section>}
    <footer>Powered by Servonas · This approval records acceptance of the displayed estimate version and is not presented as a legal e-signature.</footer>
  </section></main>;
}
