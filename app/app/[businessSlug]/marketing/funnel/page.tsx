import Link from "next/link";
import {WorkspaceNav} from "../../WorkspaceNav";
import {requireWorkspace} from "@/lib/workspace";
import {canManageBusiness} from "@/lib/access";

const stages=["landing_page_view","check_availability_clicked","availability_date_selected","booking_started","customer_info_entered","checkout_started","booking_completed"] as const;
type StageName=(typeof stages)[number];
type SourceFilter="all"|"google";

const journeyShort:Record<StageName,string>={
 landing_page_view:"Landing",
 check_availability_clicked:"Availability",
 availability_date_selected:"Date selected",
 booking_started:"Booking started",
 customer_info_entered:"Customer info",
 checkout_started:"Checkout",
 booking_completed:"Booked",
};

type EventRow={
 event_name:StageName;
 booking_total_cents:number|null;
 metadata:Record<string,unknown>|null;
 booking_attribution_sessions?:{utm_source?:string|null;gclid?:string|null;gbraid?:string|null;wbraid?:string|null}|{utm_source?:string|null;gclid?:string|null;gbraid?:string|null;wbraid?:string|null}[]|null;
};

const percent=(value:number,total:number)=>total?Math.round(value/total*100):null;
const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
const displayRate=(value:number,total:number)=>{const result=percent(value,total);return result==null?"—":`${result}%`;};
const validDate=(value:string|undefined)=>Boolean(value&&/^\d{4}-\d{2}-\d{2}$/.test(value));
const monthStart=(value:string)=>`${value.slice(0,8)}01`;
const shiftDays=(value:string,days:number)=>{const date=new Date(`${value}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
const sourceOf=(row:EventRow)=>{const relation=Array.isArray(row.booking_attribution_sessions)?row.booking_attribution_sessions[0]:row.booking_attribution_sessions;if(!relation)return "Direct";if(relation.gclid||relation.gbraid||relation.wbraid||/google/i.test(relation.utm_source??""))return "Google Ads";if(relation.utm_source)return relation.utm_source;return "Direct";};

function stageCount(rows:EventRow[],name:StageName,source:SourceFilter){
 return rows.filter(row=>row.event_name===name&&(source==="all"||sourceOf(row)==="Google Ads")).length;
}

function stageRevenue(rows:EventRow[],source:string){
 return rows.filter(row=>row.event_name==="booking_completed"&&sourceOf(row)===source).reduce((sum,row)=>sum+Number(row.booking_total_cents??0),0);
}

function sourceCount(rows:EventRow[],source:string,stage:StageName){
 return rows.filter(row=>row.event_name===stage&&sourceOf(row)===source).length;
}

export default async function BookingFunnelPage({params,searchParams}:{params:Promise<{businessSlug:string}>;searchParams:Promise<{from?:string;to?:string;source?:string}>}){
 const {businessSlug}=await params,q=await searchParams,{supabase,business,role}=await requireWorkspace(businessSlug);
 const canViewMarketing=canManageBusiness(role);
 const today="2026-08-20";
 const to=validDate(q.to)?q.to!:today;
 const from=validDate(q.from)?q.from!:monthStart(to);
 const source=(q.source==="google"?"google":"all") as SourceFilter;
 if(!canViewMarketing)return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content marketing-page"><div className="workspace-notice error">Only owners and administrators can view marketing analytics.</div></section></main>;

 let query=supabase.from("booking_funnel_events").select("event_name,booking_total_cents,metadata,booking_attribution_sessions!inner(utm_source,gclid,gbraid,wbraid)").eq("business_id",business.id).gte("occurred_at",`${from}T00:00:00Z`).lte("occurred_at",`${to}T23:59:59Z`);
 if(source==="google")query=query.or("gclid.not.is.null,gbraid.not.is.null,wbraid.not.is.null,utm_source.ilike.google",{foreignTable:"booking_attribution_sessions"});
 const {data,error}=await query;

 const rows=(data??[]) as EventRow[];
 const counts=Object.fromEntries(stages.map(name=>[name,stageCount(rows,name,source)])) as Record<StageName,number>;
 const revenue=rows.filter(row=>row.event_name==="booking_completed").reduce((sum,row)=>sum+Number(row.booking_total_cents??0),0);
 const completedBookings=counts.booking_completed;
 const trafficSources=[...new Set(rows.map(sourceOf))].sort((a,b)=>a==="Google Ads"?-1:b==="Google Ads"?1:a.localeCompare(b));
 const sourceRows=trafficSources.map(name=>({name,visits:sourceCount(rows,name,"landing_page_view"),availability:sourceCount(rows,name,"check_availability_clicked"),bookings:sourceCount(rows,name,"booking_completed"),revenue:stageRevenue(rows,name)})).filter(row=>row.visits||row.availability||row.bookings||row.revenue);
 const transitions=stages.slice(1).map((stage,index)=>{const previous=stages[index],fromCount=counts[previous],toCount=counts[stage],continued=percent(toCount,fromCount),drop=fromCount>0?Math.max(0,fromCount-toCount):0,dropRate=fromCount>0?Math.round((drop/fromCount)*100):null;return {from:previous,to:stage,fromCount,toCount,continued,drop,dropRate};});
 const biggestDrop=transitions.filter(item=>item.fromCount>0&&item.drop>0&&item.dropRate!==null).sort((a,b)=>(b.dropRate??0)-(a.dropRate??0)||b.drop-a.drop)[0]??null;
 const noActivity=!rows.length;
 const noBookings=!noActivity&&completedBookings===0;
 const avgCompletedBooking=completedBookings?Math.round(revenue/completedBookings):0;
 const quickRanges=[{label:"Last 7 days",from:shiftDays(to,-6),to},{label:"Last 30 days",from:shiftDays(to,-29),to},{label:"This month",from:monthStart(to),to}];

 return <main className="epic3-shell"><WorkspaceNav slug={businessSlug} name={business.name} industry={business.industry_profile}/><section className="epic3-content marketing-page marketing-funnel-page">
  <header className="marketing-analytics-header"><div><span className="sv-kicker">Marketing</span><h1>Booking funnel</h1><p>See how visitors move from your website to a completed booking.</p>{business.name&&<small>{business.name}</small>}</div></header>
  <nav className="marketing-subnav" aria-label="Marketing sections"><Link href={`/app/${businessSlug}/marketing/funnel`} aria-current="page">Funnel</Link><Link href={`/app/${businessSlug}/marketing/discounts`}>Discounts</Link></nav>
  <form className="workspace-panel marketing-filter-bar" method="get"><div className="marketing-filter-group"><label>From<input type="date" name="from" defaultValue={from}/></label><label>To<input type="date" name="to" defaultValue={to}/></label><label>Traffic source<select name="source" defaultValue={source}><option value="all">All traffic</option><option value="google">Google Ads</option></select></label></div><div className="marketing-filter-actions"><div className="marketing-quick-ranges">{quickRanges.map(range=><Link key={range.label} href={`/app/${businessSlug}/marketing/funnel?from=${range.from}&to=${range.to}&source=${source}`}>{range.label}</Link>)}</div><button className="sv-button">Update report</button></div></form>
  {error?<div className="workspace-notice error">Apply the booking funnel attribution migration to view this report.</div>:<>
   <section className="marketing-kpi-grid" aria-label="Booking funnel summary">
    <article className="workspace-panel"><span>Landing visits</span><strong>{counts.landing_page_view}</strong><small>Website sessions</small></article>
    <article className="workspace-panel"><span>Availability checks</span><strong>{counts.check_availability_clicked}</strong><small>{displayRate(counts.check_availability_clicked,counts.landing_page_view)} of visitors</small></article>
    <article className="workspace-panel"><span>Booking starts</span><strong>{counts.booking_started}</strong><small>{displayRate(counts.booking_started,counts.landing_page_view)} of visitors</small></article>
    <article className="workspace-panel"><span>Completed bookings</span><strong>{counts.booking_completed}</strong><small>{displayRate(counts.booking_completed,counts.landing_page_view)} conversion</small></article>
    <article className="workspace-panel"><span>Attributed revenue</span><strong>{money(revenue)}</strong><small>From completed bookings</small></article>
   </section>
   <section className="workspace-panel marketing-journey-panel"><header><div><h2>Booking journey</h2><p>See where customers continue and where they leave.</p></div></header><ol className="marketing-journey">{stages.map((stage,index)=>{const previous=index?counts[stages[index-1]]:0;const continued=index?displayRate(counts[stage],previous):"Starting point";const inactive=counts[stage]===0;return <li className={inactive?"is-inactive":""} key={stage}><article><span>{journeyShort[stage]}</span><strong>{counts[stage]}</strong><small>{index===0?"Website sessions":`${continued} continued`}</small></article>{index<stages.length-1&&<div className="marketing-journey-connector" aria-hidden="true"><b>→</b><small>{displayRate(counts[stages[index+1]],counts[stage])} continued</small></div>}</li>;})}</ol></section>
   {(noActivity||noBookings)&&<section className="workspace-panel marketing-empty-state"><strong>{noActivity?"No funnel activity for this date range":"No completed bookings yet"}</strong><p>{noActivity?"Try expanding the date range or changing the traffic-source filter.":"When customers complete bookings, conversion and revenue data will appear here."}</p></section>}
   <section className="marketing-secondary-grid">
    <article className="workspace-panel"><h2>Biggest drop-off</h2>{biggestDrop?<><strong>{journeyShort[biggestDrop.from]} → {journeyShort[biggestDrop.to]}</strong><b>{biggestDrop.dropRate}% drop</b><p>{biggestDrop.drop===1?`1 customer reached ${journeyShort[biggestDrop.from].toLowerCase()}, but none continued to ${journeyShort[biggestDrop.to].toLowerCase()}.`:`${biggestDrop.drop} customers reached ${journeyShort[biggestDrop.from].toLowerCase()}, but fewer continued to ${journeyShort[biggestDrop.to].toLowerCase()}.`}</p></>:<><strong>Not enough data yet</strong><p>More activity is needed before Servonas can identify a meaningful drop-off.</p></>}</article>
    <article className="workspace-panel"><h2>Conversion overview</h2><dl className="marketing-conversion-list"><div><dt>Visitor → Availability</dt><dd>{displayRate(counts.check_availability_clicked,counts.landing_page_view)}</dd></div><div><dt>Availability → Booking Started</dt><dd>{displayRate(counts.booking_started,counts.check_availability_clicked)}</dd></div><div><dt>Booking Started → Completed</dt><dd>{displayRate(counts.booking_completed,counts.booking_started)}</dd></div><div><dt>Visitor → Completed</dt><dd>{displayRate(counts.booking_completed,counts.landing_page_view)}</dd></div><div><dt>Average completed booking</dt><dd>{completedBookings?money(avgCompletedBooking):"—"}</dd></div></dl></article>
   </section>
   {sourceRows.length>1&&<section className="workspace-panel marketing-sources-panel"><header><div><h2>Traffic sources</h2><p>Source performance based on the attribution already captured by Servonas.</p></div></header><div className="marketing-sources-table"><div><b>Source</b><b>Visits</b><b>Availability</b><b>Bookings</b><b>Revenue</b></div>{sourceRows.map(row=><div key={row.name}><span>{row.name}</span><span>{row.visits}</span><span>{row.availability}</span><span>{row.bookings}</span><span>{money(row.revenue)}</span></div>)}</div></section>}
   <details className="workspace-panel marketing-attribution-note"><summary>How attribution works</summary><p>Google Ads attribution: A session is considered Google Ads-attributed when Servonas captures a Google click identifier or recognized Google Ads UTM attribution. These represent Servonas-attributed sessions, not imported Google Ads click totals.</p></details>
  </>}
 </section></main>;
}
