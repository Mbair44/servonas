import Link from "next/link";
import {WorkspaceNav} from "../../WorkspaceNav";
import {requireWorkspace} from "@/lib/workspace";
import {canManageBusiness} from "@/lib/access";
import {acquisitionDateRange} from "@/lib/acquisitionReporting";
import {buildSourcePerformanceReport,labelForSource} from "@/lib/marketingAttribution";
import {GoogleAdsSpendProvider} from "@/lib/marketingSpend";

const money=(cents:number|null)=>cents==null?"Ad spend not connected":new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
const revenue=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
const percent=(value:number|null)=>value==null?"—":`${Math.round(value*100)}%`;

export default async function BookingFunnelPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<{range?:string;from?:string;to?:string}>}){
 const {businessSlug}=await params;
 const q=await searchParams;
 const {supabase,business,role}=await requireWorkspace(businessSlug);
 if(!canManageBusiness(role))return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content marketing-page"><div className="workspace-notice error">Only owners and administrators can view marketing analytics.</div></section></main>;
 const window=acquisitionDateRange(q.range,q.from,q.to,new Date(),business.timezone);
 const {data,error}=await supabase.from("booking_funnel_events").select("event_name,occurred_at,attribution_session_id,booking_id,customer_id,inventory_item_id,service_id,invoice_id,booking_total_cents,amount_paid_cents,currency,metadata,booking_attribution_sessions(utm_source,utm_medium,utm_campaign,utm_content,utm_term,first_referrer,first_landing_url,first_landing_path,gclid,gbraid,wbraid)").eq("business_id",business.id).gte("occurred_at",window.from).lt("occurred_at",window.to);
 const spendBySource=await new GoogleAdsSpendProvider(supabase).getSpendBySource({businessId:business.id,from:window.from,to:window.to});
 const report=buildSourcePerformanceReport((data??[]) as any,spendBySource);

 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content marketing-page marketing-funnel-page">
  <header className="marketing-analytics-header"><div><span className="sv-kicker">Marketing</span><h1>Attribution funnel</h1><p>See where visitors come from, where they drop off, and whether your advertising is producing revenue.</p><small>{business.name}</small></div></header>
  <nav className="marketing-subnav" aria-label="Marketing sections"><Link href={`/app/${businessSlug}/marketing/funnel`} aria-current="page">Funnel</Link><Link href={`/app/${businessSlug}/marketing/discounts`}>Discounts</Link><Link href={`/app/${businessSlug}/marketing/google-ads`}>Google Ads</Link></nav>
  {error?<div className="workspace-notice error">Apply the marketing attribution funnel migration to view this report.</div>:<>
   <section className="marketing-kpi-grid">
    <article className="workspace-panel"><span>Total visits</span><strong>{report.totals.visits}</strong><small>Attributed landing views</small></article>
    <article className="workspace-panel"><span>Leads / bookings</span><strong>{report.totals.leadsOrBookings}</strong><small>Across all sources</small></article>
    <article className="workspace-panel"><span>Revenue</span><strong>{revenue(report.totals.revenueCents)}</strong><small>Attributed customer value</small></article>
    <article className="workspace-panel"><span>Ad spend</span><strong>{report.totals.spendCents?revenue(report.totals.spendCents):"Ad spend not connected"}</strong><small>Only when integrations provide spend</small></article>
    <article className="workspace-panel"><span>ROAS</span><strong>{report.totals.roas!=null?`${report.totals.roas.toFixed(1)}x`:"—"}</strong><small>Revenue divided by ad spend</small></article>
   </section>
   <section className="workspace-panel marketing-sources-panel"><header><div><h2>Source performance</h2><p>Normalized first-touch attribution, scoped to this business.</p></div></header><div className="marketing-sources-table"><div><b>Source</b><b>Visits</b><b>Engaged</b><b>Leads</b><b>Bookings</b><b>Revenue</b><b>Spend</b><b>ROAS</b></div>{report.summaries.map(row=><div key={row.source}><span>{labelForSource(row.source)}</span><span>{row.visits}</span><span>{row.engaged}</span><span>{row.detailedCounts.lead_submitted??0}</span><span>{row.detailedCounts.booking_completed??0}</span><span>{revenue(row.revenueCents)}</span><span>{row.spendCents!=null?revenue(row.spendCents):"Ad spend not connected"}</span><span>{row.roas!=null?`${row.roas.toFixed(1)}x`:"—"}</span></div>)}</div></section>
   <section className="marketing-secondary-grid">
    <article className="workspace-panel"><h2>Marketing insights</h2><div className="marketing-conversion-list">{report.summaries.map(row=><div key={`insight-${row.source}`}><dt>{labelForSource(row.source)}</dt><dd>{row.insight}</dd></div>)}</div></article>
    <article className="workspace-panel"><h2>Reporting window</h2><dl className="marketing-conversion-list"><div><dt>From</dt><dd>{window.from.slice(0,10)}</dd></div><div><dt>To</dt><dd>{window.to.slice(0,10)}</dd></div><div><dt>Attribution model</dt><dd>First touch preserved through booking flow</dd></div><div><dt>Spend coverage</dt><dd>{spendBySource.google_ads!=null?"Google Ads connected":"Ad spend not connected"}</dd></div></dl></article>
   </section>
   {report.summaries.map(row=><details className="workspace-panel marketing-attribution-note" key={`funnel-${row.source}`}><summary>{labelForSource(row.source)} funnel</summary><div className="marketing-sources-table">{row.stepCounts.filter(step=>step.count>0||step.key==="landing_view").map(step=><div key={`${row.source}-${step.key}`}><span>{step.label}</span><span>{step.count}</span><span>{percent(step.progressFromPrevious)}</span><span>{percent(step.dropOffRate)}</span></div>)}</div></details>)}
  </>}
 </section></main>;
}
