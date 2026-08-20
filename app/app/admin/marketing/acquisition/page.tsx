import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabaseServer";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {isServonasPlatformAdmin} from "@/lib/platformAccess";
import {acquisitionDateRange,buildAcquisitionReport,classifyAcquisitionSource} from "@/lib/acquisitionReporting";

const label=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,l=>l.toUpperCase());
const percent=(value:number)=>`${value.toFixed(value%1===0?0:1)}%`;
const formatDate=(value:string)=>value.slice(0,10);

export default async function AcquisitionReport({searchParams}:{searchParams:Promise<{industry?:string;source?:string;range?:string;from?:string;to?:string}>}){
 const q=await searchParams,s=await createSupabaseServerClient(),{data:{user}}=await s.auth.getUser();
 if(!isServonasPlatformAdmin(user))redirect("/app");
 const db=getSupabaseAdmin();
 if(!db)return <main className="admin-entitlements"><p>Private analytics access is not configured.</p></main>;
 const range=q.range==="today"||q.range==="last_30_days"||q.range==="custom"?q.range:"last_7_days";
 const window=acquisitionDateRange(range,q.from,q.to,new Date());
 let sessionsQuery=db.from("website_acquisition_sessions").select("id,industry,first_landing_path,first_landing_url,first_referrer,first_seen_at,gclid,gbraid,wbraid,utm_source,utm_medium,utm_campaign,utm_term,utm_content").gte("first_seen_at",window.from).lte("first_seen_at",window.to);
 if(q.industry)sessionsQuery=sessionsQuery.eq("industry",q.industry);
 const {data:sessionRows,error}=await sessionsQuery.order("first_seen_at",{ascending:false});
 const sessionIds=(sessionRows??[]).map(row=>row.id);
 const {data:eventRows}=sessionIds.length?await db.from("website_acquisition_events").select("acquisition_session_id,event_name").in("acquisition_session_id",sessionIds).gte("occurred_at",window.from).lte("occurred_at",window.to):{data:[]};
 const filteredSessions=(sessionRows??[]).filter(row=>!q.source||classifyAcquisitionSource(row)===q.source);
 const industries=[...new Set((sessionRows??[]).map(row=>row.industry).filter(Boolean) as string[])].sort();
 const report=buildAcquisitionReport(filteredSessions,eventRows??[]);
 return <main className="admin-entitlements"><header><div><span className="sv-kicker">Servonas acquisition</span><h1>Website-builder funnel</h1><p>Landing pages are grouped by normalized pathname while attribution stays available for drill-down.</p></div><Link className="sv-button sv-secondary" href="/admin">Admin dashboard</Link></header>
  <form className="admin-filter-form">
   <label>Industry<select name="industry" defaultValue={q.industry??""}><option value="">All industries</option>{industries.map(value=><option value={value} key={value}>{label(value)}</option>)}</select></label>
   <label>Traffic<select name="source" defaultValue={q.source??""}><option value="">All traffic</option><option value="Google Ads">Google Ads</option><option value="Organic">Organic</option><option value="Direct">Direct</option><option value="Facebook">Facebook</option><option value="Other">Other</option></select></label>
   <label>Date range<select name="range" defaultValue={range}><option value="last_7_days">Last 7 days</option><option value="last_30_days">Last 30 days</option><option value="today">Today</option><option value="custom">Custom</option></select></label>
   <label>From<input type="date" name="from" defaultValue={q.from??formatDate(window.from)}/></label>
   <label>To<input type="date" name="to" defaultValue={q.to??formatDate(window.to)}/></label>
   <button className="sv-button sv-secondary">Apply</button>
  </form>
  {error?<p className="workspace-notice error">Acquisition analytics could not be loaded. Apply the acquisition funnel migration.</p>:<>
   <section className="admin-acquisition-stages">
    <article><span>Sessions</span><strong>{report.overall.sessions}</strong></article>
    <article><span>Builder starts</span><strong>{report.overall.builderStarts}</strong><small>{percent(report.overall.sessionToBuilderRate)} of sessions</small></article>
    <article><span>Previews</span><strong>{report.overall.previews}</strong><small>{percent(report.overall.builderToPreviewRate)} of starts</small></article>
    <article><span>Businesses</span><strong>{report.overall.businesses}</strong><small>{percent(report.overall.sessionToBusinessRate)} of sessions</small></article>
   </section>
   {report.overall.largestDropOff&&<aside className="workspace-notice">Largest drop-off: <strong>{report.overall.largestDropOff.stage}</strong> ({report.overall.largestDropOff.count} sessions).</aside>}
   <section className="workspace-panel"><h2>Landing page breakdown</h2><div className="admin-acquisition-table"><div><b>Landing page</b><b>Sessions</b><b>Builder starts</b><b>Previews</b><b>Businesses</b><b>Start rate</b><b>Preview rate</b><b>Business rate</b><b>Drop-off</b></div>{report.landingPages.map(page=><div key={page.path}><span>{page.path}</span><span>{page.sessions}</span><span>{page.builderStarts}</span><span>{page.previews}</span><span>{page.businesses}</span><span>{percent(page.sessionToBuilderRate)}</span><span>{percent(page.builderToPreviewRate)}</span><span>{percent(page.sessionToBusinessRate)}</span><span>{page.largestDropOff?`${page.largestDropOff.stage} · ${page.largestDropOff.count}`:"—"}</span></div>)}</div></section>
   <section className="workspace-panel"><h2>Traffic source summary</h2><div className="admin-acquisition-table"><div><b>Source</b><b>Sessions</b></div>{report.sourceSummary.map(source=><div key={source.source}><span>{source.source}</span><span>{source.sessions}</span></div>)}</div></section>
   <section className="workspace-panel"><h2>Attribution drill-down</h2><div className="admin-acquisition-table"><div><b>Landing page</b><b>Source</b><b>Sessions</b><b>UTM source</b><b>UTM campaign</b><b>gclid</b><b>gbraid</b><b>wbraid</b></div>{report.attributionRows.map((row,index)=><div key={`${row.landingPage}-${row.source}-${index}`}><span>{row.landingPage}</span><span>{row.source}</span><span>{row.sessions}</span><span title={row.utmSource??""}>{row.utmSource??"—"}</span><span title={row.utmCampaign??""}>{row.utmCampaign??"—"}</span><span title={row.gclid??""}>{row.gclid?`${row.gclid.slice(0,24)}…`:"—"}</span><span title={row.gbraid??""}>{row.gbraid?`${row.gbraid.slice(0,24)}…`:"—"}</span><span title={row.wbraid??""}>{row.wbraid?`${row.wbraid.slice(0,24)}…`:"—"}</span></div>)}</div></section>
   <section className="workspace-panel"><h2>Counting rules</h2><p>Sessions are deduplicated by unique acquisition session ID. Later funnel stages count unique session IDs that recorded the stage event within the selected date range, so duplicate events in one session do not inflate the report.</p></section>
  </>}
 </main>;
}
